import type {CustomPoseNet, drawKeypoints, drawSkeleton} from '@teachablemachine/pose';
import {definitionRecord as record} from '../definition-references.js';
import {parseDsl4RemotePoseJson} from '../remote-pose-directory.js';
import {createDsl4ProjectTMRuntime} from './posenet-bundle.js';

type Prediction = {className: string; probability: number};
type ImageModel = {
  predict(input: HTMLCanvasElement): Promise<Prediction[]>;
  dispose(): void;
};
type ModelLoader<T> = (model: File, weights: File, metadata: File) => Promise<T>;
type ModelFiles = {
  model: Uint8Array;
  weights: Uint8Array;
  weightsPath: string;
  metadata: Uint8Array;
};

const colors = ['#bd2f5e', '#2469cf', '#087b9d', '#a34f00', '#6e45b5', '#207557'];
const sampleRate = 44100;
const fftBins = 1024;

function modelInfo(files: ModelFiles) {
  const metadata = record(parseDsl4RemotePoseJson(files.metadata, 'metadata.json'));
  const words = metadata.wordLabels ?? metadata.words;
  const kind = Array.isArray(words)
    ? 'audio'
    : metadata.packageName === '@teachablemachine/image'
      ? 'image'
      : 'pose';
  const labels = kind === 'audio' ? words : metadata.labels;
  if (
    !Array.isArray(labels) ||
    !labels.length ||
    labels.some((label) => typeof label !== 'string' || !label.trim()) ||
    new Set(labels).size !== labels.length
  )
    throw new Error('認識モデルのクラス名を読み取れません。');
  return {kind, labels: labels as string[]} as const;
}

function paintSpectrum(
  context: CanvasRenderingContext2D,
  frames: readonly Float32Array[],
  bins: number,
) {
  const {width, height} = context.canvas;
  const columnWidth = width / frames.length;
  const bandHeight = height / bins;
  frames.forEach((frame, x) => {
    for (let y = 0; y < bins; y++) {
      const intensity = Math.max(0, Math.min(1, ((frame[y] ?? -100) + 100) / 75));
      context.fillStyle = `hsl(${220 + intensity * 130} 75% ${7 + intensity * 65}%)`;
      context.fillRect(
        x * columnWidth,
        height - (y + 1) * bandHeight,
        Math.ceil(columnWidth),
        Math.ceil(bandHeight),
      );
    }
  });
}

async function runAudio(
  tf: typeof import('@tensorflow/tfjs'),
  files: [File, File, File],
  labels: string[],
  stream: MediaStream,
  context: CanvasRenderingContext2D,
  audio: AudioContext,
  publish: (predictions: Prediction[]) => void,
  signal: AbortSignal,
  fail: (error: unknown) => void,
) {
  const model = await tf.loadLayersModel(tf.io.browserFiles(files.slice(0, 2)));
  let timer: ReturnType<typeof setInterval> | undefined;
  let active: Promise<void> | undefined;
  try {
    signal.throwIfAborted();
    const [batch, frameCount, bins, channels] = model.inputs[0]?.shape ?? [];
    if (
      model.inputs.length !== 1 ||
      (batch !== null && batch !== 1) ||
      !frameCount ||
      frameCount > 256 ||
      !bins ||
      bins > fftBins ||
      channels !== 1 ||
      model.outputs.length !== 1 ||
      model.outputs[0]?.shape.at(-1) !== labels.length
    )
      throw new Error('Audio モデルの入力または出力形式に対応していません。');

    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    // Match the browser FFT parameters used to train Teachable Machine Audio models.
    analyser.fftSize = fftBins * 2;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    const spectrum = new Float32Array(fftBins);
    const frames: Float32Array[] = [];
    const stride = Math.max(1, Math.round(frameCount / 4));
    let sincePrediction = stride;
    const tick = () => {
      analyser.getFloatFrequencyData(spectrum);
      if (!Number.isFinite(spectrum[0])) return;
      const frame = spectrum.slice(0, bins);
      for (let bin = 0; bin < bins; bin++) {
        if (!Number.isFinite(frame[bin])) frame[bin] = analyser.minDecibels;
      }
      frames.push(frame);
      if (frames.length > frameCount) frames.shift();
      if (frames.length !== frameCount || ++sincePrediction < stride || active) return;
      sincePrediction = 0;
      paintSpectrum(context, frames, bins);
      const data = new Float32Array(frameCount * bins);
      frames.forEach((row, index) => data.set(row, index * bins));
      active = (async () => {
        const prediction = tf.tidy(() => {
          const input = tf.tensor4d(data, [1, frameCount, bins, 1]);
          const {mean, variance} = tf.moments(input);
          const normalized = input.sub(mean).div(variance.sqrt().add(tf.backend().epsilon()));
          const output = model.predict(normalized);
          if (Array.isArray(output)) throw new Error('Audio モデルの出力形式が不正です。');
          return output;
        });
        try {
          const scores = await prediction.data();
          publish(
            labels.map((className, index) => ({className, probability: Number(scores[index])})),
          );
        } finally {
          prediction.dispose();
        }
      })()
        .catch(fail)
        .finally(() => {
          active = undefined;
        });
    };
    signal.addEventListener(
      'abort',
      () => {
        clearInterval(timer);
        source.disconnect();
        analyser.disconnect();
      },
      {once: true},
    );
    timer = setInterval(
      () => {
        try {
          tick();
        } catch (error) {
          fail(error);
        }
      },
      (fftBins / sampleRate) * 1000,
    );
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), {once: true}),
    );
  } finally {
    await active;
    model.dispose();
  }
}

async function runCamera(
  kind: 'image' | 'pose',
  files: [File, File, File],
  video: HTMLVideoElement,
  context: CanvasRenderingContext2D,
  project: unknown,
  publish: (predictions: Prediction[]) => void,
  signal: AbortSignal,
) {
  const host = globalThis as typeof globalThis & {
    tmImage?: {loadFromFiles: ModelLoader<ImageModel>};
    tmPose?: {
      loadFromFiles: ModelLoader<CustomPoseNet>;
      drawKeypoints: typeof drawKeypoints;
      drawSkeleton: typeof drawSkeleton;
    };
  };
  const pose = host.tmPose;
  // Static bundles expose their component storage through non-enumerable VM aliases.
  const storage = {...record(record(project).extensionStorage)};
  const hasBundledPoseNet = Boolean(
    record(storage.kubohiroyakamishibairuntime4).poseNet ||
    record(record(record(storage.kubohiroyakamishibai4).components).kubohiroyakamishibairuntime4)
      .poseNet,
  );
  const image = kind === 'image' ? await host.tmImage?.loadFromFiles(...files) : undefined;
  const poseLoader =
    kind === 'pose' && pose && hasBundledPoseNet
      ? createDsl4ProjectTMRuntime({runtime: pose, project: {extensionStorage: storage}})
      : pose;
  const poseModel =
    kind === 'pose'
      ? ((await poseLoader?.loadFromFiles(...files)) as CustomPoseNet | undefined)
      : undefined;
  if (!image && !poseModel) throw new Error('Teachable Machine の認識機能を利用できません。');

  try {
    signal.throwIfAborted();
    const input = video.ownerDocument.createElement('canvas');
    const {width, height} = context.canvas;
    input.width = width;
    input.height = height;
    const pixels = input.getContext('2d');
    if (!pixels) throw new Error('カメラ映像を描画できません。');
    const view = video.ownerDocument.defaultView!;
    while (!signal.aborted) {
      await new Promise<void>((resolve) => {
        const frame = view.requestAnimationFrame(() => {
          signal.removeEventListener('abort', cancel);
          resolve();
        });
        function cancel() {
          view.cancelAnimationFrame(frame);
          resolve();
        }
        signal.addEventListener('abort', cancel, {once: true});
      });
      if (signal.aborted || !video.videoWidth || !video.videoHeight) continue;
      const size = Math.min(video.videoWidth, video.videoHeight);
      pixels.setTransform(-1, 0, 0, 1, width, 0);
      pixels.drawImage(
        video,
        (video.videoWidth - size) / 2,
        (video.videoHeight - size) / 2,
        size,
        size,
        0,
        0,
        width,
        height,
      );
      if (poseModel && pose) {
        const estimate = await poseModel.estimatePose(input);
        if (signal.aborted) break;
        const predictions = await poseModel.predict(estimate.posenetOutput);
        if (signal.aborted) break;
        context.drawImage(input, 0, 0);
        if (estimate.pose) {
          pose.drawSkeleton(estimate.pose.keypoints, 0.5, context, 4, '#168af0');
          pose.drawKeypoints(estimate.pose.keypoints, 0.5, context, 5, '#168af0', '#168af0');
        }
        publish(predictions);
      } else if (image) {
        const predictions = await image.predict(input);
        if (signal.aborted) break;
        context.drawImage(input, 0, 0);
        publish(predictions);
      }
    }
  } finally {
    image?.dispose();
    poseModel?.dispose();
  }
}

export function mountDsl4RecognitionModelPreview(
  container: HTMLElement,
  files: ModelFiles,
  project: unknown,
) {
  const {kind, labels} = modelInfo(files);
  const document = container.ownerDocument;
  const section = document.createElement('div');
  section.dataset.dsl4ModelPreview = kind;
  section.style.cssText = 'max-width:20rem;display:grid;gap:.6rem;';
  const title = document.createElement('strong');
  const type = {image: 'Image', audio: 'Audio', pose: 'Pose'}[kind];
  const device = kind === 'audio' ? 'マイク' : 'カメラ';
  title.textContent = `Teachable Machine · ${type}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.style.justifySelf = 'start';
  const status = document.createElement('div');
  status.setAttribute('role', 'status');

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = kind === 'audio' ? 224 : 320;
  canvas.style.cssText =
    'width:100%;max-height:42vh;object-fit:contain;background:#142238;border-radius:12px;';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', kind === 'audio' ? '音声のスペクトログラム' : 'カメラ映像');

  const chart = document.createElement('div');
  chart.setAttribute('role', 'group');
  chart.setAttribute('aria-label', 'クラス別の予測確率');
  chart.style.cssText =
    'padding:.75rem;background:#fff;color:#172338;border-radius:10px;box-shadow:0 3px 12px #18223638;display:grid;gap:.4rem;';
  const rows = labels.map((name, index) => {
    const row = document.createElement('div');
    row.style.cssText =
      'display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr) 3.25em;align-items:center;gap:.4em;border-radius:.3em;';
    const label = document.createElement('span');
    label.textContent = name;
    label.style.cssText = 'overflow-wrap:anywhere;font-weight:600;';
    const color = colors[index % colors.length]!;
    label.style.color = color;
    const track = document.createElement('div');
    track.style.cssText = `background:${color}20;border-radius:.3em;overflow:hidden;height:1.2em;`;
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-label', name);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const bar = document.createElement('div');
    bar.style.cssText = `height:100%;background:${color};width:0%;transition:width .1s linear;`;
    const value = document.createElement('span');
    value.style.cssText = 'text-align:end;font-variant-numeric:tabular-nums;';
    track.append(bar);
    row.append(label, track, value);
    chart.append(row);
    return {name, row, track, bar, value};
  });
  section.append(title, button, status, canvas, chart);

  let session: AbortController | undefined;
  function showPredictions(predictions: Prediction[] = []) {
    const scores = new Map(predictions.map(({className, probability}) => [className, probability]));
    let winner: string | undefined;
    let best = -1;
    for (const {name} of rows) {
      const score = scores.get(name);
      if (score !== undefined && Number.isFinite(score) && score > best) {
        best = score;
        winner = name;
      }
    }
    for (const {name, row, track, bar, value} of rows) {
      const score = scores.get(name);
      const percent =
        score !== undefined && Number.isFinite(score)
          ? Math.round(Math.max(0, Math.min(1, score)) * 100)
          : undefined;
      bar.style.width = `${percent ?? 0}%`;
      value.textContent = percent === undefined ? '—' : `${percent}%`;
      row.dataset.recognized = String(winner === name);
      row.style.outline = winner === name ? '2px solid currentColor' : '';
      track.setAttribute('aria-valuenow', String(percent ?? 0));
      track.setAttribute(
        'aria-valuetext',
        winner === name
          ? `${value.textContent}（最も高い予測）`
          : percent === undefined
            ? '未計測'
            : value.textContent,
      );
    }
  }

  function stop(message = `${device}を開始すると認識結果を表示します。`) {
    session?.abort();
    session = undefined;
    button.textContent = `${device}を開始`;
    status.textContent = message;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    showPredictions();
  }
  async function start() {
    const controller = new AbortController();
    const {signal} = controller;
    session = controller;
    button.textContent = '停止';
    status.textContent = `${device}と認識モデルを準備しています…`;
    let audio: AudioContext | undefined;
    const fail = (error: unknown) => {
      if (signal.aborted) return;
      const message =
        error instanceof Error && error.name === 'NotAllowedError'
          ? `${device}へのアクセスを許可してください。`
          : error instanceof Error
            ? error.message
            : String(error);
      stop(`${type} プレビューを開始・継続できませんでした。 ${message}`);
    };
    const publish = (predictions: Prediction[]) => {
      if (signal.aborted) return;
      if (status.textContent !== `${device}で認識中`) status.textContent = `${device}で認識中`;
      showPredictions(predictions);
    };
    try {
      const view = document.defaultView;
      const media = view?.navigator.mediaDevices;
      if (!view || !media?.getUserMedia)
        throw new Error(`${device}を利用できる環境で開いてください。`);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('プレビュー画面を描画できません。');
      if (kind === 'audio') {
        audio = new AudioContext({sampleRate});
        void audio.resume().catch(fail);
        signal.addEventListener(
          'abort',
          () => {
            void audio?.close().catch(() => {});
          },
          {once: true},
        );
      }
      const stream = await media.getUserMedia(
        kind === 'audio'
          ? {audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}}
          : {video: {facingMode: 'user'}},
      );
      const tracks = stream.getTracks();
      const stopTracks = () => {
        for (const track of tracks) track.stop();
      };
      if (signal.aborted) {
        stopTracks();
        return;
      }
      signal.addEventListener('abort', stopTracks, {once: true});
      for (const track of tracks) {
        track.addEventListener(
          'ended',
          () => fail(new Error(`${device}への接続が終了しました。`)),
          {once: true, signal},
        );
      }
      const tf = (globalThis as typeof globalThis & {tf?: typeof import('@tensorflow/tfjs')}).tf;
      if (!tf) throw new Error('Teachable Machine の認識機能を利用できません。');
      await tf.ready();
      signal.throwIfAborted();
      const input: [File, File, File] = [
        new File([new Uint8Array(files.model)], 'model.json'),
        new File([new Uint8Array(files.weights)], files.weightsPath),
        new File([new Uint8Array(files.metadata)], 'metadata.json'),
      ];
      if (kind === 'audio' && audio) {
        await runAudio(tf, input, labels, stream, context, audio, publish, signal, fail);
      } else if (kind !== 'audio') {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        signal.addEventListener(
          'abort',
          () => {
            video.pause();
            video.srcObject = null;
          },
          {once: true},
        );
        await video.play();
        if (signal.aborted) return;
        await runCamera(kind, input, video, context, project, publish, signal);
      }
    } catch (error) {
      fail(error);
    }
  }
  const toggle = () => {
    if (session) stop();
    else void start();
  };
  stop();
  button.addEventListener('click', toggle);
  container.append(section);
  return () => {
    button.removeEventListener('click', toggle);
    stop();
    section.remove();
  };
}
