// Name: Bubble
// ID: kubohiroyabubble
// Description: Layered say and think bubbles with portrait animation and continue indicators.
// By: Hiroya Kubo
// License: MPL-2.0
// Unsandboxed: required
// Description[ja]: 立ち絵のアニメーションや入力待ちの表示を伴う吹き出しを、重ねて表示します。

(function (Scratch) {
  'use strict';

//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
    key = keys[i];
    if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
      get: ((k) => from[k]).bind(null, key),
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
  value: mod,
  enumerable: true
}) : target, mod));
//#endregion
//#region src/config.ts
var extensionConfig$1 = {
  id: "kubohiroyabubble",
  slug: "turbowarp-bubble",
  name: "Bubble",
  description: "Layered say and think bubbles with portrait animation and continue indicators.",
  author: "Hiroya Kubo",
  license: "MPL-2.0",
  unsandboxed: true,
  blockIconURI: `data:image/svg+xml,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><path d=\"M9 8h17a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5H18l-7 5v-5H9a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5z\" fill=\"#59C059\"/><path d=\"M29 23h10a5 5 0 0 1 5 5v5a5 5 0 0 1-5 5h-6l-6 4v-4a5 5 0 0 1-3-5v-5a5 5 0 0 1 5-5z\" fill=\"#4C97FF\"/></svg>")}`
};
var block_definitions_default$1 = {
  extensionName: "Bubble",
  blocks: [
    {
      "opcode": "defineBubbleStyle",
      "blockType": "COMMAND",
      "text": "define bubble style [STYLE] using text style [TEXT_STYLE]",
      "description": "Defines or replaces a bubble style. The default text style without further settings uses the Scratch-compatible basic profile.",
      "arguments": {
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        },
        "TEXT_STYLE": {
          "type": "STRING",
          "defaultValue": "default"
        }
      }
    },
    {
      "opcode": "defineBubbleClosePolicy",
      "blockType": "COMMAND",
      "text": "define bubble close policy [POLICY] trigger [TRIGGER] condition [CONDITION] timeout [TIMEOUT] seconds",
      "description": "Defines or replaces a named close policy. The trigger explicitly selects a condition, a timeout, or whichever happens first.",
      "arguments": {
        "POLICY": {
          "type": "STRING",
          "defaultValue": "advance-or-timeout"
        },
        "TRIGGER": {
          "type": "STRING",
          "defaultValue": "condition-or-timeout",
          "menu": "closePolicyTrigger"
        },
        "CONDITION": {
          "type": "STRING",
          "defaultValue": "input == \"pressed\""
        },
        "TIMEOUT": {
          "type": "NUMBER",
          "defaultValue": 10
        }
      }
    },
    {
      "opcode": "setBubblePlacement",
      "blockType": "COMMAND",
      "text": "set bubble placement [PLACEMENT] for bubble style [STYLE]",
      "description": "Sets an actor-relative direction/angle or a background-relative region. Direction aliases and Scratch-style degrees from 0 through 360 are accepted.",
      "arguments": {
        "PLACEMENT": {
          "type": "STRING",
          "defaultValue": "up-right",
          "menu": "placement"
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setPortraitBase",
      "blockType": "COMMAND",
      "text": "set portrait base [ASSET] for bubble style [STYLE]",
      "description": "Sets the registered image asset used as the portrait base. An empty asset removes the complete portrait.",
      "arguments": {
        "ASSET": {
          "type": "STRING",
          "defaultValue": "HeroFace"
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setPortraitLayout",
      "blockType": "COMMAND",
      "text": "set portrait [PLACEMENT] offset x [X] y [Y] zoom [ZOOM] % corner radius [RADIUS] px for bubble style [STYLE]",
      "description": "Places the portrait at a bubble edge or corner with a local offset, zoom, and rounded corners. NONE removes the portrait.",
      "arguments": {
        "PLACEMENT": {
          "type": "STRING",
          "defaultValue": "left",
          "menu": "portraitPlacement"
        },
        "X": {
          "type": "NUMBER",
          "defaultValue": 0
        },
        "Y": {
          "type": "NUMBER",
          "defaultValue": 0
        },
        "ZOOM": {
          "type": "NUMBER",
          "defaultValue": 100
        },
        "RADIUS": {
          "type": "NUMBER",
          "defaultValue": 0
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleDistance",
      "blockType": "COMMAND",
      "text": "set bubble distance [DISTANCE] for bubble style [STYLE]",
      "description": "Sets the distance from the actor bounds to the tail tip for actor-relative placement.",
      "arguments": {
        "DISTANCE": {
          "type": "NUMBER",
          "defaultValue": 12
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleVisualStyle",
      "blockType": "COMMAND",
      "text": "set bubble visual style [VISUAL_STYLE] for bubble style [STYLE]",
      "description": "Sets the inseparable SVG body and tail or trail shape pair used by this bubble style.",
      "arguments": {
        "VISUAL_STYLE": {
          "type": "STRING",
          "defaultValue": "NORMAL",
          "menu": "visualStyle"
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleTailLength",
      "blockType": "COMMAND",
      "text": "set bubble tail length [LENGTH] for bubble style [STYLE]",
      "description": "Sets the nominal length from the bubble border to the tail tip for actor-relative placement.",
      "arguments": {
        "LENGTH": {
          "type": "NUMBER",
          "defaultValue": 18
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleOffset",
      "blockType": "COMMAND",
      "text": "set bubble offset x [X] y [Y] scale [SCALE] % for bubble style [STYLE]",
      "description": "Offsets and scales the bubble body while keeping scale-only actor distance constant.",
      "arguments": {
        "X": {
          "type": "NUMBER",
          "defaultValue": 0
        },
        "Y": {
          "type": "NUMBER",
          "defaultValue": 0
        },
        "SCALE": {
          "type": "NUMBER",
          "defaultValue": 100
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBlinkFrames",
      "blockType": "COMMAND",
      "text": "set blink frames [ASSETS] every [SECONDS] seconds for bubble style [STYLE]",
      "description": "Sets comma-separated registered image assets for the portrait blink layer. An empty list removes blink animation.",
      "arguments": {
        "ASSETS": {
          "type": "STRING",
          "defaultValue": "EyesOpen,EyesClosed"
        },
        "SECONDS": {
          "type": "NUMBER",
          "defaultValue": .4
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setLipSyncFrames",
      "blockType": "COMMAND",
      "text": "set lip-sync frames [ASSETS] every [SECONDS] seconds for bubble style [STYLE]",
      "description": "Sets comma-separated registered image assets for the portrait lip-sync layer. An empty list removes lip-sync animation.",
      "arguments": {
        "ASSETS": {
          "type": "STRING",
          "defaultValue": "MouthClosed,MouthOpen"
        },
        "SECONDS": {
          "type": "NUMBER",
          "defaultValue": .1
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setContinueFrames",
      "blockType": "COMMAND",
      "text": "set continue frames [ASSETS] every [SECONDS] seconds for bubble style [STYLE]",
      "description": "Sets at least two comma-separated registered image assets for the awaiting-continue indicator. An empty list removes the indicator.",
      "arguments": {
        "ASSETS": {
          "type": "STRING",
          "defaultValue": "Next1,Next2"
        },
        "SECONDS": {
          "type": "NUMBER",
          "defaultValue": .2
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleReveal",
      "blockType": "COMMAND",
      "text": "set bubble reveal unit [UNIT] every [SECONDS] seconds layout [LAYOUT] for bubble style [STYLE]",
      "description": "Sets CHARACTER, WORD, LINE, or BLOCK sequential reveal. WORD uses the configured delimiters; DYNAMIC reflows as text grows and RESERVED reserves the final text size.",
      "arguments": {
        "UNIT": {
          "type": "STRING",
          "defaultValue": "CHARACTER",
          "menu": "revealUnit"
        },
        "SECONDS": {
          "type": "NUMBER",
          "defaultValue": .05
        },
        "LAYOUT": {
          "type": "STRING",
          "defaultValue": "DYNAMIC",
          "menu": "revealLayout"
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleWordDelimiters",
      "blockType": "COMMAND",
      "text": "set bubble word delimiters [DELIMITERS] show [SHOW] for bubble style [STYLE]",
      "description": "Sets the character set used by WORD reveal and chooses whether delimiters remain visible.",
      "arguments": {
        "DELIMITERS": {
          "type": "STRING",
          "defaultValue": " /"
        },
        "SHOW": {
          "type": "STRING",
          "defaultValue": "false",
          "menu": "boolean"
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleRevealSound",
      "blockType": "COMMAND",
      "text": "set bubble reveal sound [ASSET] for bubble style [STYLE]",
      "description": "Sets a named audio asset played once per CHARACTER, WORD, LINE, or BLOCK reveal.",
      "arguments": {
        "ASSET": {
          "type": "STRING",
          "defaultValue": "Typewriter"
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleVoice",
      "blockType": "COMMAND",
      "text": "set bubble voice [ASSET] for bubble style [STYLE]",
      "description": "Sets the named full-voice audio asset played when the Bubble starts.",
      "arguments": {
        "ASSET": {
          "type": "STRING",
          "defaultValue": "Voice"
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "finishBubbleReveal",
      "blockType": "COMMAND",
      "text": "finish [UNIT] with condition [CONDITION] or timeout after [TIMEOUT] seconds",
      "description": "Reveals the remaining units and waits for the Runtime Expression condition or timeout before completing.",
      "arguments": {
        "UNIT": {
          "type": "STRING",
          "defaultValue": "CHARACTER",
          "menu": "revealUnit"
        },
        "CONDITION": {
          "type": "STRING",
          "defaultValue": "input == \"pressed\""
        },
        "TIMEOUT": {
          "type": "NUMBER",
          "defaultValue": 10
        }
      }
    },
    {
      "opcode": "setBubbleShowAnimation",
      "blockType": "COMMAND",
      "text": "set bubble show animation [MOTION] for [SECONDS] seconds for bubble style [STYLE]",
      "description": "Selects the animation played when a Bubble starts displaying.",
      "arguments": {
        "MOTION": {
          "type": "STRING",
          "defaultValue": "fadeIn",
          "menu": "showMotion"
        },
        "SECONDS": {
          "type": "NUMBER",
          "defaultValue": .2
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleHideAnimation",
      "blockType": "COMMAND",
      "text": "set bubble hide animation [MOTION] for [SECONDS] seconds for bubble style [STYLE]",
      "description": "Selects the animation played before a Bubble is closed. It works with both DYNAMIC and RESERVED layout.",
      "arguments": {
        "MOTION": {
          "type": "STRING",
          "defaultValue": "fadeOut",
          "menu": "hideMotion"
        },
        "SECONDS": {
          "type": "NUMBER",
          "defaultValue": .2
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "animateBubble",
      "blockType": "COMMAND",
      "text": "animate this bubble [MOTION]",
      "description": "Plays an immediate display animation such as shake, explode, or a named show/hide motion.",
      "arguments": { "MOTION": {
        "type": "STRING",
        "defaultValue": "shake",
        "menu": "motion"
      } }
    },
    {
      "opcode": "shakeBubble",
      "blockType": "COMMAND",
      "text": "shake this bubble direction [DIRECTION] count [COUNT] ease [EASE]",
      "description": "Shakes the complete Bubble surface, including portrait and text, with an easing selection.",
      "arguments": {
        "DIRECTION": {
          "type": "NUMBER",
          "defaultValue": 90
        },
        "COUNT": {
          "type": "NUMBER",
          "defaultValue": 2
        },
        "EASE": {
          "type": "STRING",
          "defaultValue": "easeInOut",
          "menu": "ease"
        }
      }
    },
    {
      "opcode": "explodeBubble",
      "blockType": "COMMAND",
      "text": "explode this bubble relative scale [SCALE] count [COUNT] ease [EASE]",
      "description": "Changes the complete Bubble surface size by a relative amount for the requested number of cycles.",
      "arguments": {
        "SCALE": {
          "type": "NUMBER",
          "defaultValue": 1.15
        },
        "COUNT": {
          "type": "NUMBER",
          "defaultValue": 2
        },
        "EASE": {
          "type": "STRING",
          "defaultValue": "easeOut",
          "menu": "ease"
        }
      }
    },
    {
      "opcode": "animateBubbleShape",
      "blockType": "COMMAND",
      "text": "animate bubble shape to [VISUAL_STYLE] speed [SPEED] for [SECONDS] seconds",
      "description": "Transitions the Bubble outline to THINKING, DREAMING, YELLING, WAVY, WHISPERING, or another visual style.",
      "arguments": {
        "VISUAL_STYLE": {
          "type": "STRING",
          "defaultValue": "WAVY",
          "menu": "visualStyle"
        },
        "SPEED": {
          "type": "NUMBER",
          "defaultValue": 1
        },
        "SECONDS": {
          "type": "NUMBER",
          "defaultValue": .5
        }
      }
    },
    {
      "opcode": "say",
      "blockType": "COMMAND",
      "text": "say [MESSAGE]",
      "description": "Shows or replaces this sprite's Scratch-compatible default say bubble. An empty message closes it.",
      "arguments": { "MESSAGE": {
        "type": "STRING",
        "defaultValue": "Hello!"
      } }
    },
    {
      "opcode": "think",
      "blockType": "COMMAND",
      "text": "think [MESSAGE]",
      "description": "Shows or replaces this sprite's Scratch-compatible default think bubble. An empty message closes it.",
      "arguments": { "MESSAGE": {
        "type": "STRING",
        "defaultValue": "Hmm..."
      } }
    },
    {
      "opcode": "showWithBubbleStyle",
      "blockType": "COMMAND",
      "text": "show [MESSAGE] with bubble style [STYLE]",
      "description": "Shows or replaces this sprite's Bubble. The selected style determines the complete body and tail or trail shape.",
      "arguments": {
        "MESSAGE": {
          "type": "STRING",
          "defaultValue": "Hello!"
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "say"
        }
      }
    },
    {
      "opcode": "sayWithBubbleStyle",
      "blockType": "COMMAND",
      "text": "say [MESSAGE] with bubble style [STYLE]",
      "description": "Shows or replaces this sprite's say bubble in talking animation mode. An empty message closes the basic profile.",
      "hideFromPalette": true,
      "arguments": {
        "MESSAGE": {
          "type": "STRING",
          "defaultValue": "Hello!"
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "thinkWithBubbleStyle",
      "blockType": "COMMAND",
      "text": "think [MESSAGE] with bubble style [STYLE]",
      "description": "Shows or replaces this sprite's think bubble in talking animation mode. An empty message closes the basic profile.",
      "hideFromPalette": true,
      "arguments": {
        "MESSAGE": {
          "type": "STRING",
          "defaultValue": "Hmm..."
        },
        "STYLE": {
          "type": "STRING",
          "defaultValue": "dialogue"
        }
      }
    },
    {
      "opcode": "setBubbleAnimationMode",
      "blockType": "COMMAND",
      "text": "set this bubble animation mode [MODE]",
      "description": "Changes this sprite's bubble animation mode. Awaiting continue stops lip-sync animation and starts the configured continue frames.",
      "arguments": { "MODE": {
        "type": "STRING",
        "defaultValue": "awaiting-continue",
        "menu": "animationMode"
      } }
    },
    {
      "opcode": "waitForBubbleContinue",
      "blockType": "COMMAND",
      "text": "wait with this bubble until condition [CONDITION] or timeout after [TIMEOUT] seconds",
      "description": "Switches to awaiting-continue mode, evaluates a Runtime Expression condition using variables updated by Async Input, and waits until the condition is true or the timeout expires. Zero disables the timeout.",
      "arguments": {
        "CONDITION": {
          "type": "STRING",
          "defaultValue": "input == \"pressed\""
        },
        "TIMEOUT": {
          "type": "NUMBER",
          "defaultValue": 10
        }
      }
    },
    {
      "opcode": "waitAndCloseBubbleWithPolicy",
      "blockType": "COMMAND",
      "text": "wait and close this bubble using close policy [POLICY]",
      "description": "Snapshots the named close policy, waits for its trigger, then closes this sprite's bubble and releases its resources.",
      "arguments": { "POLICY": {
        "type": "STRING",
        "defaultValue": "advance-or-timeout"
      } }
    },
    {
      "opcode": "closeBubble",
      "blockType": "COMMAND",
      "text": "close this bubble",
      "description": "Closes this sprite's bubble and releases its timers and rendering resources.",
      "arguments": {}
    },
    {
      "opcode": "getVersion",
      "blockType": "REPORTER",
      "text": "Bubble version",
      "description": "Returns the Bubble implementation version.",
      "arguments": {}
    }
  ],
  menus: {
    "closePolicyTrigger": {
      "acceptReporters": true,
      "items": [
        "condition",
        "timeout",
        "condition-or-timeout"
      ]
    },
    "portraitPlacement": {
      "acceptReporters": true,
      "items": [
        "none",
        "left",
        "right",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right"
      ]
    },
    "visualStyle": {
      "acceptReporters": true,
      "items": [
        "NORMAL",
        "THINKING",
        "DREAMING",
        "YELLING",
        "OFF_PANEL",
        "WAVY",
        "WHISPERING",
        "ANNOUNCEMENT",
        "NARRATION",
        "NO_BUBBLE"
      ]
    },
    "placement": {
      "acceptReporters": true,
      "items": [
        "up",
        "up-up-right",
        "up-right",
        "right-up-right",
        "right",
        "right-down-right",
        "down-right",
        "down-down-right",
        "down",
        "down-down-left",
        "down-left",
        "left-down-left",
        "left",
        "left-up-left",
        "up-left",
        "up-up-left",
        "HEADER_LIKE",
        "CENTER",
        "FOOTER_LIKE"
      ]
    },
    "animationMode": {
      "acceptReporters": true,
      "items": [
        "talking",
        "awaiting-continue",
        "idle"
      ]
    },
    "revealUnit": {
      "acceptReporters": true,
      "items": [
        "CHARACTER",
        "WORD",
        "LINE",
        "BLOCK"
      ]
    },
    "revealLayout": {
      "acceptReporters": true,
      "items": ["DYNAMIC", "RESERVED"]
    },
    "boolean": {
      "acceptReporters": true,
      "items": ["false", "true"]
    },
    "showMotion": {
      "acceptReporters": true,
      "items": [
        "fadeIn",
        "floatIn",
        "zoomIn",
        "riseUp"
      ]
    },
    "hideMotion": {
      "acceptReporters": true,
      "items": [
        "fadeOut",
        "floatOut",
        "zoomOut",
        "sink"
      ]
    },
    "motion": {
      "acceptReporters": true,
      "items": [
        "fadeIn",
        "floatIn",
        "zoomIn",
        "riseUp",
        "fadeOut",
        "floatOut",
        "zoomOut",
        "sink",
        "shake",
        "explode",
        "animateBubbleShape"
      ]
    },
    "ease": {
      "acceptReporters": true,
      "items": [
        "linear",
        "easeIn",
        "easeOut",
        "easeInOut"
      ]
    }
  }
};
var block_editor_fixed_inputs_schema_default$1 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://kubohiroya.github.io/turbowarp-bubble/schemas/block-editor-fixed-inputs.schema.json",
  title: "turbowarp-bubble fixed editing contracts",
  $defs: {
    "defineBubbleClosePolicy": {
      "type": "object",
      "properties": {
        "TRIGGER": {
          "type": "string",
          "enum": [
            "condition",
            "timeout",
            "condition-or-timeout"
          ]
        },
        "TIMEOUT": {
          "type": "number",
          "exclusiveMinimum": 0
        }
      },
      "additionalProperties": false
    },
    "setPortraitLayout": {
      "type": "object",
      "properties": {
        "PLACEMENT": {
          "type": "string",
          "enum": [
            "none",
            "left",
            "right",
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right"
          ]
        },
        "X": { "type": "number" },
        "Y": { "type": "number" },
        "ZOOM": {
          "type": "number",
          "exclusiveMinimum": 0
        },
        "RADIUS": {
          "type": "number",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "setBubbleDistance": {
      "type": "object",
      "properties": { "DISTANCE": {
        "type": "number",
        "minimum": 0
      } },
      "additionalProperties": false
    },
    "setBubbleVisualStyle": {
      "type": "object",
      "properties": { "VISUAL_STYLE": {
        "type": "string",
        "enum": [
          "NORMAL",
          "THINKING",
          "DREAMING",
          "YELLING",
          "OFF_PANEL",
          "WAVY",
          "WHISPERING",
          "ANNOUNCEMENT",
          "NARRATION",
          "NO_BUBBLE"
        ]
      } },
      "additionalProperties": false
    },
    "setBubbleTailLength": {
      "type": "object",
      "properties": { "LENGTH": {
        "type": "number",
        "exclusiveMinimum": 0
      } },
      "additionalProperties": false
    },
    "setBubbleOffset": {
      "type": "object",
      "properties": {
        "X": { "type": "number" },
        "Y": { "type": "number" },
        "SCALE": {
          "type": "number",
          "exclusiveMinimum": 0
        }
      },
      "additionalProperties": false
    },
    "setBlinkFrames": {
      "type": "object",
      "properties": { "SECONDS": {
        "type": "number",
        "exclusiveMinimum": 0
      } },
      "additionalProperties": false
    },
    "setLipSyncFrames": {
      "type": "object",
      "properties": { "SECONDS": {
        "type": "number",
        "exclusiveMinimum": 0
      } },
      "additionalProperties": false
    },
    "setContinueFrames": {
      "type": "object",
      "properties": { "SECONDS": {
        "type": "number",
        "exclusiveMinimum": 0
      } },
      "additionalProperties": false
    },
    "setBubbleReveal": {
      "type": "object",
      "properties": {
        "UNIT": {
          "type": "string",
          "enum": [
            "CHARACTER",
            "WORD",
            "LINE",
            "BLOCK"
          ]
        },
        "SECONDS": {
          "type": "number",
          "minimum": 0
        },
        "LAYOUT": {
          "type": "string",
          "enum": ["DYNAMIC", "RESERVED"]
        }
      },
      "additionalProperties": false
    },
    "setBubbleWordDelimiters": {
      "type": "object",
      "properties": { "SHOW": {
        "type": "string",
        "enum": ["false", "true"]
      } },
      "additionalProperties": false
    },
    "finishBubbleReveal": {
      "type": "object",
      "properties": {
        "UNIT": {
          "type": "string",
          "enum": [
            "CHARACTER",
            "WORD",
            "LINE",
            "BLOCK"
          ]
        },
        "TIMEOUT": {
          "type": "number",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "setBubbleShowAnimation": {
      "type": "object",
      "properties": {
        "MOTION": {
          "type": "string",
          "enum": [
            "fadeIn",
            "floatIn",
            "zoomIn",
            "riseUp"
          ]
        },
        "SECONDS": {
          "type": "number",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "setBubbleHideAnimation": {
      "type": "object",
      "properties": {
        "MOTION": {
          "type": "string",
          "enum": [
            "fadeOut",
            "floatOut",
            "zoomOut",
            "sink"
          ]
        },
        "SECONDS": {
          "type": "number",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "animateBubble": {
      "type": "object",
      "properties": { "MOTION": {
        "type": "string",
        "enum": [
          "fadeIn",
          "floatIn",
          "zoomIn",
          "riseUp",
          "fadeOut",
          "floatOut",
          "zoomOut",
          "sink",
          "shake",
          "explode",
          "animateBubbleShape"
        ]
      } },
      "additionalProperties": false
    },
    "shakeBubble": {
      "type": "object",
      "properties": {
        "DIRECTION": { "type": "number" },
        "COUNT": {
          "type": "integer",
          "minimum": 1
        },
        "EASE": {
          "type": "string",
          "enum": [
            "linear",
            "easeIn",
            "easeOut",
            "easeInOut"
          ]
        }
      },
      "additionalProperties": false
    },
    "explodeBubble": {
      "type": "object",
      "properties": {
        "SCALE": {
          "type": "number",
          "exclusiveMinimum": 0
        },
        "COUNT": {
          "type": "integer",
          "minimum": 1
        },
        "EASE": {
          "type": "string",
          "enum": [
            "linear",
            "easeIn",
            "easeOut",
            "easeInOut"
          ]
        }
      },
      "additionalProperties": false
    },
    "animateBubbleShape": {
      "type": "object",
      "properties": {
        "VISUAL_STYLE": {
          "type": "string",
          "enum": [
            "NORMAL",
            "THINKING",
            "DREAMING",
            "YELLING",
            "OFF_PANEL",
            "WAVY",
            "WHISPERING",
            "ANNOUNCEMENT",
            "NARRATION",
            "NO_BUBBLE"
          ]
        },
        "SPEED": {
          "type": "number",
          "minimum": 0
        },
        "SECONDS": {
          "type": "number",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "setBubbleAnimationMode": {
      "type": "object",
      "properties": { "MODE": {
        "type": "string",
        "enum": [
          "talking",
          "awaiting-continue",
          "idle"
        ]
      } },
      "additionalProperties": false
    },
    "waitForBubbleContinue": {
      "type": "object",
      "properties": { "TIMEOUT": {
        "type": "number",
        "minimum": 0
      } },
      "additionalProperties": false
    }
  }
};
//#endregion
//#region src/fixed-input-editors.ts
var contracts$1 = block_editor_fixed_inputs_schema_default$1.$defs;
var repository$1 = "turbowarp-bubble";
var canonicalSource$1 = {
  repository: repository$1,
  path: "schemas/block-editor-fixed-inputs.schema.json"
};
var contractRevision$1 = "fixed-inputs-v1";
var numberToken$1 = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;
/** New input only: never run this strict lexical policy over unmodified raw fields. */
function fixedNumber$1(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !numberToken$1.test(value.trim())) throw new TypeError("Invalid fixed number.");
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError("Invalid fixed number.");
  return number;
}
function existingNumber$1(value) {
  if (typeof value !== "string" && typeof value !== "number") throw new TypeError("Invalid numeric projection.");
  if (typeof value === "string" && value.trim() === "") throw new TypeError("Unprojected existing numeric field.");
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError("Invalid numeric projection.");
  return number;
}
function normalizeChoice$1(opcode, argument, value) {
  const trimmed = value.trim();
  if ([
    "VISUAL_STYLE",
    "UNIT",
    "LAYOUT"
  ].includes(argument)) return trimmed.toUpperCase();
  if ([
    "TRIGGER",
    "SHOW",
    "MODE",
    "PLACEMENT"
  ].includes(argument)) {
    const lowered = trimmed.toLowerCase();
    return opcode === "setPortraitLayout" ? lowered.replaceAll("_", "-") : lowered;
  }
  return trimmed;
}
function bundle$1(opcode, argument) {
  const source = {
    ...canonicalSource$1,
    symbol: `/$defs/${opcode}/properties/${argument}`
  };
  return {
    identity: {
      ownerId: repository$1,
      contractId: `${opcode}.${argument}`,
      revision: contractRevision$1,
      variantId: "fixed"
    },
    dialect: "draft-07",
    root: {
      retrievalUri: `${block_editor_fixed_inputs_schema_default$1.$id}?binding=${opcode}.${argument}`,
      document: contracts$1[opcode].properties[argument],
      artifact: {
        role: "canonical-schema",
        source
      }
    },
    resources: [],
    provenance: {
      canonicalSources: [
        source,
        {
          repository: repository$1,
          path: "src/block-definitions.json"
        },
        {
          repository: repository$1,
          path: "src/extension.ts",
          symbol: opcode
        }
      ],
      generatedFiles: [],
      referenceSchemas: [],
      generationSources: []
    }
  };
}
function fixedInputEditorOptions$1() {
  return Object.entries(contracts$1).map(([opcode, contract]) => {
    const bindings = Object.entries(contract.properties).map(([argument, schema]) => ({
      argument,
      schemaBundle: bundle$1(opcode, argument),
      control: schema.enum ? {
        kind: "enum",
        choices: schema.enum.map((value) => ({
          value,
          label: value
        }))
      } : { kind: schema.type === "number" || schema.type === "integer" ? "number" : "color" },
      read(value) {
        if (schema.type === "number" || schema.type === "integer") return existingNumber$1(value);
        if (typeof value !== "string") throw new TypeError("Invalid string projection.");
        return schema.enum ? normalizeChoice$1(opcode, argument, value) : value;
      },
      encode(value) {
        if (schema.type === "number" || schema.type === "integer") {
          fixedNumber$1(value);
          return typeof value === "number" ? Object.is(value, -0) ? "-0" : String(value) : value.trim();
        }
        if (typeof value !== "string") throw new TypeError("Invalid fixed string.");
        return value;
      },
      validateCandidate(candidate) {
        let valid;
        try {
          if (schema.type === "number" || schema.type === "integer") {
            const number = existingNumber$1(candidate);
            valid = (schema.type !== "integer" || Number.isInteger(number)) && (schema.minimum === void 0 || number >= schema.minimum) && (schema.maximum === void 0 || number <= schema.maximum) && (schema.exclusiveMinimum === void 0 || number > schema.exclusiveMinimum);
          } else valid = typeof candidate === "string" && (schema.enum ? schema.enum.includes(candidate) : new RegExp(schema.pattern, "u").test(candidate));
        } catch {
          valid = false;
        }
        return valid ? [] : [{
          path: argument,
          message: "Check this value before saving."
        }];
      }
    }));
    return {
      apiVersion: 1,
      extensionId: extensionConfig$1.id,
      editorId: `${extensionConfig$1.id}.fixed.${opcode}`,
      opcodes: [`${extensionConfig$1.id}_${opcode}`],
      contractId: `${repository$1}.${opcode}.fixed`,
      contractRevision: contractRevision$1,
      bindings,
      validationContext: () => ({
        consumerId: repository$1,
        nowMs: 0,
        settings: null
      }),
      ...opcode === "defineBubbleClosePolicy" ? {
        readOnlyArguments: ["CONDITION"],
        dependencies: [{
          selector: "TRIGGER",
          dependents: ["TIMEOUT"]
        }],
        branchPolicies: [{
          selector: "TRIGGER",
          normalize: {
            trim: true,
            lowercase: true
          },
          cases: [
            {
              values: ["condition"],
              activeDependents: [],
              requireOnSelectorChange: [{
                argument: "CONDITION",
                rule: "nonempty-string"
              }]
            },
            {
              values: ["timeout"],
              activeDependents: ["TIMEOUT"]
            },
            {
              values: ["condition-or-timeout"],
              activeDependents: ["TIMEOUT"],
              requireOnSelectorChange: [{
                argument: "CONDITION",
                rule: "nonempty-string"
              }]
            }
          ]
        }]
      } : {}
    };
  });
}
/** Optional GUI capability; ordinary runtime/composition consumers do not load the editor. */
function registerFixedInputEditors$1(scratch, runtime) {
  const api = scratch.gui?.blockEditors;
  if (api?.apiVersion !== 1 || typeof api.registerFixedInputEditor !== "function") return void 0;
  const events = runtime;
  const definitions = fixedInputEditorOptions$1();
  const removers = [];
  let state = "registered";
  const release = () => {
    for (const remove of removers.splice(0).reverse()) remove();
  };
  const register = () => {
    try {
      for (const options of definitions) removers.push(api.registerFixedInputEditor.call(api, options));
    } catch (error) {
      release();
      throw error;
    }
  };
  const releaseForRuntimeDispose = () => {
    if (state !== "registered") return;
    state = "released";
    release();
  };
  const restoreAfterProjectLoad = () => {
    if (state !== "released") return;
    register();
    state = "registered";
  };
  const dispose = () => {
    if (state === "disposed") return;
    state = "disposed";
    events.off?.("RUNTIME_DISPOSED", releaseForRuntimeDispose);
    events.off?.("PROJECT_LOADED", restoreAfterProjectLoad);
    release();
  };
  register();
  events.on?.("RUNTIME_DISPOSED", releaseForRuntimeDispose);
  events.on?.("PROJECT_LOADED", restoreAfterProjectLoad);
  return dispose;
}
//#endregion
//#region src/placement.ts
var bubbleDirectionNames = [
  "up",
  "up-up-right",
  "up-right",
  "right-up-right",
  "right",
  "right-down-right",
  "down-right",
  "down-down-right",
  "down",
  "down-down-left",
  "down-left",
  "left-down-left",
  "left",
  "left-up-left",
  "up-left",
  "up-up-left"
];
var bubbleBackgroundRegions = [
  "HEADER_LIKE",
  "CENTER",
  "FOOTER_LIKE"
];
var aliasToDirection = /* @__PURE__ */ new Map([
  ["east", "right"],
  ["east-northeast", "right-up-right"],
  ["east-southeast", "right-down-right"],
  ["north", "up"],
  ["northeast", "up-right"],
  ["north-northeast", "up-up-right"],
  ["northwest", "up-left"],
  ["north-northwest", "up-up-left"],
  ["south", "down"],
  ["southeast", "down-right"],
  ["south-southeast", "down-down-right"],
  ["southwest", "down-left"],
  ["south-southwest", "down-down-left"],
  ["west", "left"],
  ["west-northwest", "left-up-left"],
  ["west-southwest", "left-down-left"]
]);
var directionSet = new Set(bubbleDirectionNames);
var backgroundRegionSet = new Set(bubbleBackgroundRegions);
var intermediateDirectionOffset = Math.SQRT2 - 1;
var directionVectors = Object.freeze({
  down: {
    x: 0,
    y: -1
  },
  "down-down-left": {
    x: -intermediateDirectionOffset,
    y: -1
  },
  "down-down-right": {
    x: intermediateDirectionOffset,
    y: -1
  },
  "down-left": {
    x: -1,
    y: -1
  },
  "down-right": {
    x: 1,
    y: -1
  },
  left: {
    x: -1,
    y: 0
  },
  "left-down-left": {
    x: -1,
    y: -intermediateDirectionOffset
  },
  "left-up-left": {
    x: -1,
    y: intermediateDirectionOffset
  },
  right: {
    x: 1,
    y: 0
  },
  "right-down-right": {
    x: 1,
    y: -intermediateDirectionOffset
  },
  "right-up-right": {
    x: 1,
    y: intermediateDirectionOffset
  },
  up: {
    x: 0,
    y: 1
  },
  "up-left": {
    x: -1,
    y: 1
  },
  "up-right": {
    x: 1,
    y: 1
  },
  "up-up-left": {
    x: -intermediateDirectionOffset,
    y: 1
  },
  "up-up-right": {
    x: intermediateDirectionOffset,
    y: 1
  }
});
function normalizedVectorComponent(value) {
  if (Math.abs(value) < 1e-12) return 0;
  if (Math.abs(1 - Math.abs(value)) < 1e-12) return Math.sign(value);
  return value;
}
/** Accepts API values and numeric strings supplied by Scratch block inputs. */
function normalizeBubblePlacement(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > 360) throw new TypeError("Bubble placement angle must be from 0 through 360.");
    return Object.freeze({
      basis: "actor",
      direction: value === 360 ? 0 : value
    });
  }
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError("Bubble placement must be a direction, angle, or region.");
  const trimmed = value.trim();
  const region = trimmed.toUpperCase();
  if (backgroundRegionSet.has(region)) return Object.freeze({
    basis: "background",
    region
  });
  const direction = trimmed.toLowerCase();
  if (directionSet.has(direction)) return Object.freeze({
    basis: "actor",
    direction
  });
  const alias = aliasToDirection.get(direction);
  if (alias) return Object.freeze({
    basis: "actor",
    direction: alias
  });
  const degrees = Number(trimmed);
  if (Number.isFinite(degrees) && degrees >= 0 && degrees <= 360) return Object.freeze({
    basis: "actor",
    direction: degrees === 360 ? 0 : degrees
  });
  throw new TypeError("Bubble placement is invalid.");
}
function bubbleDirectionVector(direction) {
  if (typeof direction === "string") return directionVectors[direction];
  const radians = direction * Math.PI / 180;
  return Object.freeze({
    x: normalizedVectorComponent(Math.sin(radians)),
    y: normalizedVectorComponent(Math.cos(radians))
  });
}
//#endregion
//#region src/actor-transform.ts
var defaultBubbleOffset = Object.freeze({
  x: 0,
  y: 0,
  scalePercent: 100
});
function requireFinite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}
function normalizeBubbleDistance(value) {
  const distance = requireFinite(value, "Bubble distance");
  if (distance < 0) throw new TypeError("Bubble distance must be zero or greater.");
  return distance;
}
function normalizeBubbleTailLength(value) {
  const length = requireFinite(value, "Bubble tail length");
  if (length <= 0) throw new TypeError("Bubble tail length must be greater than zero.");
  return length;
}
function normalizeBubbleOffset(value) {
  if (!Array.isArray(value) || value.length !== 2 && value.length !== 3) throw new TypeError("Bubble offset must be [x, y] or [x, y, scale].");
  const x = requireFinite(value[0], "Bubble offset x");
  const y = requireFinite(value[1], "Bubble offset y");
  const scalePercent = requireFinite(value.length === 3 ? value[2] : 100, "Bubble offset scale");
  if (scalePercent <= 0) throw new TypeError("Bubble offset scale must be greater than zero.");
  return Object.freeze({
    x,
    y,
    scalePercent
  });
}
function actorRelativeBubbleCenter(input) {
  const actorCenterX = (input.bounds.left + input.bounds.right) / 2;
  const actorCenterY = (input.bounds.top + input.bounds.bottom) / 2;
  const vector = bubbleDirectionVector(input.direction);
  const gap = input.distance + input.tailLength;
  const horizontalDistance = vector.x < 0 ? actorCenterX - input.bounds.left + gap + input.bubbleWidth / 2 : input.bounds.right - actorCenterX + gap + input.bubbleWidth / 2;
  const verticalDistance = vector.y < 0 ? actorCenterY - input.bounds.bottom + gap + input.bubbleHeight / 2 : input.bounds.top - actorCenterY + gap + input.bubbleHeight / 2;
  const placementScale = Math.min(vector.x === 0 ? Number.POSITIVE_INFINITY : horizontalDistance / Math.abs(vector.x), vector.y === 0 ? Number.POSITIVE_INFINITY : verticalDistance / Math.abs(vector.y));
  return Object.freeze({
    x: actorCenterX + vector.x * placementScale + input.offset.x,
    y: actorCenterY + vector.y * placementScale + input.offset.y
  });
}
//#endregion
//#region node_modules/.pnpm/jsclipper@https+++codeload.github.com+platener+jsclipper+tar.gz+56aed19845113e1939d8971c47233054659436b1/node_modules/jsclipper/jsclipper.js
var require_jsclipper = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  /********************************************************************************
  *                                                                              *
  * Author    :  Angus Johnson                                                   *
  * Version   :  6.1.3a                                                          *
  * Date      :  22 January 2014                                                 *
  * Website   :  http://www.angusj.com                                           *
  * Copyright :  Angus Johnson 2010-2014                                         *
  *                                                                              *
  * License:                                                                     *
  * Use, modification & distribution is subject to Boost Software License Ver 1. *
  * http://www.boost.org/LICENSE_1_0.txt                                         *
  *                                                                              *
  * Attributions:                                                                *
  * The code in this library is an extension of Bala Vatti's clipping algorithm: *
  * "A generic solution to polygon clipping"                                     *
  * Communications of the ACM, Vol 35, Issue 7 (July 1992) pp 56-63.             *
  * http://portal.acm.org/citation.cfm?id=129906                                 *
  *                                                                              *
  * Computer graphics and geometric modeling: implementation and algorithms      *
  * By Max K. Agoston                                                            *
  * Springer; 1 edition (January 4, 2005)                                        *
  * http://books.google.com/books?q=vatti+clipping+agoston                       *
  *                                                                              *
  * See also:                                                                    *
  * "Polygon Offsetting by Computing Winding Numbers"                            *
  * Paper no. DETC2005-85513 pp. 565-575                                         *
  * ASME 2005 International Design Engineering Technical Conferences             *
  * and Computers and Information in Engineering Conference (IDETC/CIE2005)      *
  * September 24-28, 2005 , Long Beach, California, USA                          *
  * http://www.me.berkeley.edu/~mcmains/pubs/DAC05OffsetPolygon.pdf              *
  *                                                                              *
  *******************************************************************************/
  /*******************************************************************************
  *                                                                              *
  * Author    :  Timo                                                            *
  * Version   :  6.1.3.2                                                         *
  * Date      :  1 February 2014                                                 *
  *                                                                              *
  * This is a translation of the C# Clipper library to Javascript.               *
  * Int128 struct of C# is implemented using JSBN of Tom Wu.                     *
  * Because Javascript lacks support for 64-bit integers, the space              *
  * is a little more restricted than in C# version.                              *
  *                                                                              *
  * C# version has support for coordinate space:                                 *
  * +-4611686018427387903 ( sqrt(2^127 -1)/2 )                                   *
  * while Javascript version has support for space:                              *
  * +-4503599627370495 ( sqrt(2^106 -1)/2 )                                      *
  *                                                                              *
  * Tom Wu's JSBN proved to be the fastest big integer library:                  *
  * http://jsperf.com/big-integer-library-test                                   *
  *                                                                              *
  * This class can be made simpler when (if ever) 64-bit integer support comes.  *
  *                                                                              *
  *******************************************************************************/
  /*******************************************************************************
  *                                                                              *
  * Basic JavaScript BN library - subset useful for RSA encryption.              *
  * http://www-cs-students.stanford.edu/~tjw/jsbn/                               *
  * Copyright (c) 2005  Tom Wu                                                   *
  * All Rights Reserved.                                                         *
  * See "LICENSE" for details:                                                   *
  * http://www-cs-students.stanford.edu/~tjw/jsbn/LICENSE                        *
  *                                                                              *
  *******************************************************************************/
  (function() {
    "use strict";
    var use_int32 = false;
    var use_xyz = false;
    var use_deprecated = false;
    var ClipperLib = {};
    var isNode = false;
    if (typeof module !== "undefined" && module.exports) {
      module.exports = ClipperLib;
      isNode = true;
    } else if (typeof document !== "undefined") window.ClipperLib = ClipperLib;
    else self["ClipperLib"] = ClipperLib;
    var navigator_appName;
    if (!isNode) {
      var nav = navigator.userAgent.toString().toLowerCase();
      navigator_appName = navigator.appName;
    } else {
      var nav = "chrome";
      navigator_appName = "Netscape";
    }
    var browser = {};
    if (nav.indexOf("chrome") != -1 && nav.indexOf("chromium") == -1) browser.chrome = 1;
    else browser.chrome = 0;
    if (nav.indexOf("chromium") != -1) browser.chromium = 1;
    else browser.chromium = 0;
    if (nav.indexOf("safari") != -1 && nav.indexOf("chrome") == -1 && nav.indexOf("chromium") == -1) browser.safari = 1;
    else browser.safari = 0;
    if (nav.indexOf("firefox") != -1) browser.firefox = 1;
    else browser.firefox = 0;
    if (nav.indexOf("firefox/17") != -1) browser.firefox17 = 1;
    else browser.firefox17 = 0;
    if (nav.indexOf("firefox/15") != -1) browser.firefox15 = 1;
    else browser.firefox15 = 0;
    if (nav.indexOf("firefox/3") != -1) browser.firefox3 = 1;
    else browser.firefox3 = 0;
    if (nav.indexOf("opera") != -1) browser.opera = 1;
    else browser.opera = 0;
    if (nav.indexOf("msie 10") != -1) browser.msie10 = 1;
    else browser.msie10 = 0;
    if (nav.indexOf("msie 9") != -1) browser.msie9 = 1;
    else browser.msie9 = 0;
    if (nav.indexOf("msie 8") != -1) browser.msie8 = 1;
    else browser.msie8 = 0;
    if (nav.indexOf("msie 7") != -1) browser.msie7 = 1;
    else browser.msie7 = 0;
    if (nav.indexOf("msie ") != -1) browser.msie = 1;
    else browser.msie = 0;
    ClipperLib.biginteger_used = null;
    var dbits;
    var j_lm = true;
    function BigInteger(a, b, c) {
      ClipperLib.biginteger_used = 1;
      if (a != null) if ("number" == typeof a && "undefined" == typeof b) this.fromInt(a);
      else if ("number" == typeof a) this.fromNumber(a, b, c);
      else if (b == null && "string" != typeof a) this.fromString(a, 256);
      else this.fromString(a, b);
    }
    function nbi() {
      return new BigInteger(null);
    }
    function am1(i, x, w, j, c, n) {
      while (--n >= 0) {
        var v = x * this[i++] + w[j] + c;
        c = Math.floor(v / 67108864);
        w[j++] = v & 67108863;
      }
      return c;
    }
    function am2(i, x, w, j, c, n) {
      var xl = x & 32767, xh = x >> 15;
      while (--n >= 0) {
        var l = this[i] & 32767;
        var h = this[i++] >> 15;
        var m = xh * l + h * xl;
        l = xl * l + ((m & 32767) << 15) + w[j] + (c & 1073741823);
        c = (l >>> 30) + (m >>> 15) + xh * h + (c >>> 30);
        w[j++] = l & 1073741823;
      }
      return c;
    }
    function am3(i, x, w, j, c, n) {
      var xl = x & 16383, xh = x >> 14;
      while (--n >= 0) {
        var l = this[i] & 16383;
        var h = this[i++] >> 14;
        var m = xh * l + h * xl;
        l = xl * l + ((m & 16383) << 14) + w[j] + c;
        c = (l >> 28) + (m >> 14) + xh * h;
        w[j++] = l & 268435455;
      }
      return c;
    }
    if (j_lm && navigator_appName == "Microsoft Internet Explorer") {
      BigInteger.prototype.am = am2;
      dbits = 30;
    } else if (j_lm && navigator_appName != "Netscape") {
      BigInteger.prototype.am = am1;
      dbits = 26;
    } else {
      BigInteger.prototype.am = am3;
      dbits = 28;
    }
    BigInteger.prototype.DB = dbits;
    BigInteger.prototype.DM = (1 << dbits) - 1;
    BigInteger.prototype.DV = 1 << dbits;
    var BI_FP = 52;
    BigInteger.prototype.FV = Math.pow(2, BI_FP);
    BigInteger.prototype.F1 = BI_FP - dbits;
    BigInteger.prototype.F2 = 2 * dbits - BI_FP;
    var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
    var BI_RC = new Array();
    var rr = "0".charCodeAt(0), vv;
    for (vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
    rr = "a".charCodeAt(0);
    for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
    rr = "A".charCodeAt(0);
    for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
    function int2char(n) {
      return BI_RM.charAt(n);
    }
    function intAt(s, i) {
      var c = BI_RC[s.charCodeAt(i)];
      return c == null ? -1 : c;
    }
    function bnpCopyTo(r) {
      for (var i = this.t - 1; i >= 0; --i) r[i] = this[i];
      r.t = this.t;
      r.s = this.s;
    }
    function bnpFromInt(x) {
      this.t = 1;
      this.s = x < 0 ? -1 : 0;
      if (x > 0) this[0] = x;
      else if (x < -1) this[0] = x + this.DV;
      else this.t = 0;
    }
    function nbv(i) {
      var r = nbi();
      r.fromInt(i);
      return r;
    }
    function bnpFromString(s, b) {
      var k;
      if (b == 16) k = 4;
      else if (b == 8) k = 3;
      else if (b == 256) k = 8;
      else if (b == 2) k = 1;
      else if (b == 32) k = 5;
      else if (b == 4) k = 2;
      else {
        this.fromRadix(s, b);
        return;
      }
      this.t = 0;
      this.s = 0;
      var i = s.length, mi = false, sh = 0;
      while (--i >= 0) {
        var x = k == 8 ? s[i] & 255 : intAt(s, i);
        if (x < 0) {
          if (s.charAt(i) == "-") mi = true;
          continue;
        }
        mi = false;
        if (sh == 0) this[this.t++] = x;
        else if (sh + k > this.DB) {
          this[this.t - 1] |= (x & (1 << this.DB - sh) - 1) << sh;
          this[this.t++] = x >> this.DB - sh;
        } else this[this.t - 1] |= x << sh;
        sh += k;
        if (sh >= this.DB) sh -= this.DB;
      }
      if (k == 8 && (s[0] & 128) != 0) {
        this.s = -1;
        if (sh > 0) this[this.t - 1] |= (1 << this.DB - sh) - 1 << sh;
      }
      this.clamp();
      if (mi) BigInteger.ZERO.subTo(this, this);
    }
    function bnpClamp() {
      var c = this.s & this.DM;
      while (this.t > 0 && this[this.t - 1] == c) --this.t;
    }
    function bnToString(b) {
      if (this.s < 0) return "-" + this.negate().toString(b);
      var k;
      if (b == 16) k = 4;
      else if (b == 8) k = 3;
      else if (b == 2) k = 1;
      else if (b == 32) k = 5;
      else if (b == 4) k = 2;
      else return this.toRadix(b);
      var km = (1 << k) - 1, d, m = false, r = "", i = this.t;
      var p = this.DB - i * this.DB % k;
      if (i-- > 0) {
        if (p < this.DB && (d = this[i] >> p) > 0) {
          m = true;
          r = int2char(d);
        }
        while (i >= 0) {
          if (p < k) {
            d = (this[i] & (1 << p) - 1) << k - p;
            d |= this[--i] >> (p += this.DB - k);
          } else {
            d = this[i] >> (p -= k) & km;
            if (p <= 0) {
              p += this.DB;
              --i;
            }
          }
          if (d > 0) m = true;
          if (m) r += int2char(d);
        }
      }
      return m ? r : "0";
    }
    function bnNegate() {
      var r = nbi();
      BigInteger.ZERO.subTo(this, r);
      return r;
    }
    function bnAbs() {
      return this.s < 0 ? this.negate() : this;
    }
    function bnCompareTo(a) {
      var r = this.s - a.s;
      if (r != 0) return r;
      var i = this.t;
      r = i - a.t;
      if (r != 0) return this.s < 0 ? -r : r;
      while (--i >= 0) if ((r = this[i] - a[i]) != 0) return r;
      return 0;
    }
    function nbits(x) {
      var r = 1, t;
      if ((t = x >>> 16) != 0) {
        x = t;
        r += 16;
      }
      if ((t = x >> 8) != 0) {
        x = t;
        r += 8;
      }
      if ((t = x >> 4) != 0) {
        x = t;
        r += 4;
      }
      if ((t = x >> 2) != 0) {
        x = t;
        r += 2;
      }
      if ((t = x >> 1) != 0) {
        x = t;
        r += 1;
      }
      return r;
    }
    function bnBitLength() {
      if (this.t <= 0) return 0;
      return this.DB * (this.t - 1) + nbits(this[this.t - 1] ^ this.s & this.DM);
    }
    function bnpDLShiftTo(n, r) {
      var i;
      for (i = this.t - 1; i >= 0; --i) r[i + n] = this[i];
      for (i = n - 1; i >= 0; --i) r[i] = 0;
      r.t = this.t + n;
      r.s = this.s;
    }
    function bnpDRShiftTo(n, r) {
      for (var i = n; i < this.t; ++i) r[i - n] = this[i];
      r.t = Math.max(this.t - n, 0);
      r.s = this.s;
    }
    function bnpLShiftTo(n, r) {
      var bs = n % this.DB;
      var cbs = this.DB - bs;
      var bm = (1 << cbs) - 1;
      var ds = Math.floor(n / this.DB), c = this.s << bs & this.DM, i;
      for (i = this.t - 1; i >= 0; --i) {
        r[i + ds + 1] = this[i] >> cbs | c;
        c = (this[i] & bm) << bs;
      }
      for (i = ds - 1; i >= 0; --i) r[i] = 0;
      r[ds] = c;
      r.t = this.t + ds + 1;
      r.s = this.s;
      r.clamp();
    }
    function bnpRShiftTo(n, r) {
      r.s = this.s;
      var ds = Math.floor(n / this.DB);
      if (ds >= this.t) {
        r.t = 0;
        return;
      }
      var bs = n % this.DB;
      var cbs = this.DB - bs;
      var bm = (1 << bs) - 1;
      r[0] = this[ds] >> bs;
      for (var i = ds + 1; i < this.t; ++i) {
        r[i - ds - 1] |= (this[i] & bm) << cbs;
        r[i - ds] = this[i] >> bs;
      }
      if (bs > 0) r[this.t - ds - 1] |= (this.s & bm) << cbs;
      r.t = this.t - ds;
      r.clamp();
    }
    function bnpSubTo(a, r) {
      var i = 0, c = 0, m = Math.min(a.t, this.t);
      while (i < m) {
        c += this[i] - a[i];
        r[i++] = c & this.DM;
        c >>= this.DB;
      }
      if (a.t < this.t) {
        c -= a.s;
        while (i < this.t) {
          c += this[i];
          r[i++] = c & this.DM;
          c >>= this.DB;
        }
        c += this.s;
      } else {
        c += this.s;
        while (i < a.t) {
          c -= a[i];
          r[i++] = c & this.DM;
          c >>= this.DB;
        }
        c -= a.s;
      }
      r.s = c < 0 ? -1 : 0;
      if (c < -1) r[i++] = this.DV + c;
      else if (c > 0) r[i++] = c;
      r.t = i;
      r.clamp();
    }
    function bnpMultiplyTo(a, r) {
      var x = this.abs(), y = a.abs();
      var i = x.t;
      r.t = i + y.t;
      while (--i >= 0) r[i] = 0;
      for (i = 0; i < y.t; ++i) r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
      r.s = 0;
      r.clamp();
      if (this.s != a.s) BigInteger.ZERO.subTo(r, r);
    }
    function bnpSquareTo(r) {
      var x = this.abs();
      var i = r.t = 2 * x.t;
      while (--i >= 0) r[i] = 0;
      for (i = 0; i < x.t - 1; ++i) {
        var c = x.am(i, x[i], r, 2 * i, 0, 1);
        if ((r[i + x.t] += x.am(i + 1, 2 * x[i], r, 2 * i + 1, c, x.t - i - 1)) >= x.DV) {
          r[i + x.t] -= x.DV;
          r[i + x.t + 1] = 1;
        }
      }
      if (r.t > 0) r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
      r.s = 0;
      r.clamp();
    }
    function bnpDivRemTo(m, q, r) {
      var pm = m.abs();
      if (pm.t <= 0) return;
      var pt = this.abs();
      if (pt.t < pm.t) {
        if (q != null) q.fromInt(0);
        if (r != null) this.copyTo(r);
        return;
      }
      if (r == null) r = nbi();
      var y = nbi(), ts = this.s, ms = m.s;
      var nsh = this.DB - nbits(pm[pm.t - 1]);
      if (nsh > 0) {
        pm.lShiftTo(nsh, y);
        pt.lShiftTo(nsh, r);
      } else {
        pm.copyTo(y);
        pt.copyTo(r);
      }
      var ys = y.t;
      var y0 = y[ys - 1];
      if (y0 == 0) return;
      var yt = y0 * (1 << this.F1) + (ys > 1 ? y[ys - 2] >> this.F2 : 0);
      var d1 = this.FV / yt, d2 = (1 << this.F1) / yt, e = 1 << this.F2;
      var i = r.t, j = i - ys, t = q == null ? nbi() : q;
      y.dlShiftTo(j, t);
      if (r.compareTo(t) >= 0) {
        r[r.t++] = 1;
        r.subTo(t, r);
      }
      BigInteger.ONE.dlShiftTo(ys, t);
      t.subTo(y, y);
      while (y.t < ys) y[y.t++] = 0;
      while (--j >= 0) {
        var qd = r[--i] == y0 ? this.DM : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
        if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd) {
          y.dlShiftTo(j, t);
          r.subTo(t, r);
          while (r[i] < --qd) r.subTo(t, r);
        }
      }
      if (q != null) {
        r.drShiftTo(ys, q);
        if (ts != ms) BigInteger.ZERO.subTo(q, q);
      }
      r.t = ys;
      r.clamp();
      if (nsh > 0) r.rShiftTo(nsh, r);
      if (ts < 0) BigInteger.ZERO.subTo(r, r);
    }
    function bnMod(a) {
      var r = nbi();
      this.abs().divRemTo(a, null, r);
      if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r, r);
      return r;
    }
    function Classic(m) {
      this.m = m;
    }
    function cConvert(x) {
      if (x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
      else return x;
    }
    function cRevert(x) {
      return x;
    }
    function cReduce(x) {
      x.divRemTo(this.m, null, x);
    }
    function cMulTo(x, y, r) {
      x.multiplyTo(y, r);
      this.reduce(r);
    }
    function cSqrTo(x, r) {
      x.squareTo(r);
      this.reduce(r);
    }
    Classic.prototype.convert = cConvert;
    Classic.prototype.revert = cRevert;
    Classic.prototype.reduce = cReduce;
    Classic.prototype.mulTo = cMulTo;
    Classic.prototype.sqrTo = cSqrTo;
    function bnpInvDigit() {
      if (this.t < 1) return 0;
      var x = this[0];
      if ((x & 1) == 0) return 0;
      var y = x & 3;
      y = y * (2 - (x & 15) * y) & 15;
      y = y * (2 - (x & 255) * y) & 255;
      y = y * (2 - ((x & 65535) * y & 65535)) & 65535;
      y = y * (2 - x * y % this.DV) % this.DV;
      return y > 0 ? this.DV - y : -y;
    }
    function Montgomery(m) {
      this.m = m;
      this.mp = m.invDigit();
      this.mpl = this.mp & 32767;
      this.mph = this.mp >> 15;
      this.um = (1 << m.DB - 15) - 1;
      this.mt2 = 2 * m.t;
    }
    function montConvert(x) {
      var r = nbi();
      x.abs().dlShiftTo(this.m.t, r);
      r.divRemTo(this.m, null, r);
      if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r, r);
      return r;
    }
    function montRevert(x) {
      var r = nbi();
      x.copyTo(r);
      this.reduce(r);
      return r;
    }
    function montReduce(x) {
      while (x.t <= this.mt2) x[x.t++] = 0;
      for (var i = 0; i < this.m.t; ++i) {
        var j = x[i] & 32767;
        var u0 = j * this.mpl + ((j * this.mph + (x[i] >> 15) * this.mpl & this.um) << 15) & x.DM;
        j = i + this.m.t;
        x[j] += this.m.am(0, u0, x, i, 0, this.m.t);
        while (x[j] >= x.DV) {
          x[j] -= x.DV;
          x[++j]++;
        }
      }
      x.clamp();
      x.drShiftTo(this.m.t, x);
      if (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
    }
    function montSqrTo(x, r) {
      x.squareTo(r);
      this.reduce(r);
    }
    function montMulTo(x, y, r) {
      x.multiplyTo(y, r);
      this.reduce(r);
    }
    Montgomery.prototype.convert = montConvert;
    Montgomery.prototype.revert = montRevert;
    Montgomery.prototype.reduce = montReduce;
    Montgomery.prototype.mulTo = montMulTo;
    Montgomery.prototype.sqrTo = montSqrTo;
    function bnpIsEven() {
      return (this.t > 0 ? this[0] & 1 : this.s) == 0;
    }
    function bnpExp(e, z) {
      if (e > 4294967295 || e < 1) return BigInteger.ONE;
      var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e) - 1;
      g.copyTo(r);
      while (--i >= 0) {
        z.sqrTo(r, r2);
        if ((e & 1 << i) > 0) z.mulTo(r2, g, r);
        else {
          var t = r;
          r = r2;
          r2 = t;
        }
      }
      return z.revert(r);
    }
    function bnModPowInt(e, m) {
      var z;
      if (e < 256 || m.isEven()) z = new Classic(m);
      else z = new Montgomery(m);
      return this.exp(e, z);
    }
    BigInteger.prototype.copyTo = bnpCopyTo;
    BigInteger.prototype.fromInt = bnpFromInt;
    BigInteger.prototype.fromString = bnpFromString;
    BigInteger.prototype.clamp = bnpClamp;
    BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
    BigInteger.prototype.drShiftTo = bnpDRShiftTo;
    BigInteger.prototype.lShiftTo = bnpLShiftTo;
    BigInteger.prototype.rShiftTo = bnpRShiftTo;
    BigInteger.prototype.subTo = bnpSubTo;
    BigInteger.prototype.multiplyTo = bnpMultiplyTo;
    BigInteger.prototype.squareTo = bnpSquareTo;
    BigInteger.prototype.divRemTo = bnpDivRemTo;
    BigInteger.prototype.invDigit = bnpInvDigit;
    BigInteger.prototype.isEven = bnpIsEven;
    BigInteger.prototype.exp = bnpExp;
    BigInteger.prototype.toString = bnToString;
    BigInteger.prototype.negate = bnNegate;
    BigInteger.prototype.abs = bnAbs;
    BigInteger.prototype.compareTo = bnCompareTo;
    BigInteger.prototype.bitLength = bnBitLength;
    BigInteger.prototype.mod = bnMod;
    BigInteger.prototype.modPowInt = bnModPowInt;
    BigInteger.ZERO = nbv(0);
    BigInteger.ONE = nbv(1);
    function bnClone() {
      var r = nbi();
      this.copyTo(r);
      return r;
    }
    function bnIntValue() {
      if (this.s < 0) {
        if (this.t == 1) return this[0] - this.DV;
        else if (this.t == 0) return -1;
      } else if (this.t == 1) return this[0];
      else if (this.t == 0) return 0;
      return (this[1] & (1 << 32 - this.DB) - 1) << this.DB | this[0];
    }
    function bnByteValue() {
      return this.t == 0 ? this.s : this[0] << 24 >> 24;
    }
    function bnShortValue() {
      return this.t == 0 ? this.s : this[0] << 16 >> 16;
    }
    function bnpChunkSize(r) {
      return Math.floor(Math.LN2 * this.DB / Math.log(r));
    }
    function bnSigNum() {
      if (this.s < 0) return -1;
      else if (this.t <= 0 || this.t == 1 && this[0] <= 0) return 0;
      else return 1;
    }
    function bnpToRadix(b) {
      if (b == null) b = 10;
      if (this.signum() == 0 || b < 2 || b > 36) return "0";
      var cs = this.chunkSize(b);
      var a = Math.pow(b, cs);
      var d = nbv(a), y = nbi(), z = nbi(), r = "";
      this.divRemTo(d, y, z);
      while (y.signum() > 0) {
        r = (a + z.intValue()).toString(b).substr(1) + r;
        y.divRemTo(d, y, z);
      }
      return z.intValue().toString(b) + r;
    }
    function bnpFromRadix(s, b) {
      this.fromInt(0);
      if (b == null) b = 10;
      var cs = this.chunkSize(b);
      var d = Math.pow(b, cs), mi = false, j = 0, w = 0;
      for (var i = 0; i < s.length; ++i) {
        var x = intAt(s, i);
        if (x < 0) {
          if (s.charAt(i) == "-" && this.signum() == 0) mi = true;
          continue;
        }
        w = b * w + x;
        if (++j >= cs) {
          this.dMultiply(d);
          this.dAddOffset(w, 0);
          j = 0;
          w = 0;
        }
      }
      if (j > 0) {
        this.dMultiply(Math.pow(b, j));
        this.dAddOffset(w, 0);
      }
      if (mi) BigInteger.ZERO.subTo(this, this);
    }
    function bnpFromNumber(a, b, c) {
      if ("number" == typeof b) {
        if (a < 2) this.fromInt(1);
        else {
          this.fromNumber(a, c);
          if (!this.testBit(a - 1)) this.bitwiseTo(BigInteger.ONE.shiftLeft(a - 1), op_or, this);
          if (this.isEven()) this.dAddOffset(1, 0);
          while (!this.isProbablePrime(b)) {
            this.dAddOffset(2, 0);
            if (this.bitLength() > a) this.subTo(BigInteger.ONE.shiftLeft(a - 1), this);
          }
        }
      } else {
        var x = new Array(), t = a & 7;
        x.length = (a >> 3) + 1;
        b.nextBytes(x);
        if (t > 0) x[0] &= (1 << t) - 1;
        else x[0] = 0;
        this.fromString(x, 256);
      }
    }
    function bnToByteArray() {
      var i = this.t, r = new Array();
      r[0] = this.s;
      var p = this.DB - i * this.DB % 8, d, k = 0;
      if (i-- > 0) {
        if (p < this.DB && (d = this[i] >> p) != (this.s & this.DM) >> p) r[k++] = d | this.s << this.DB - p;
        while (i >= 0) {
          if (p < 8) {
            d = (this[i] & (1 << p) - 1) << 8 - p;
            d |= this[--i] >> (p += this.DB - 8);
          } else {
            d = this[i] >> (p -= 8) & 255;
            if (p <= 0) {
              p += this.DB;
              --i;
            }
          }
          if ((d & 128) != 0) d |= -256;
          if (k == 0 && (this.s & 128) != (d & 128)) ++k;
          if (k > 0 || d != this.s) r[k++] = d;
        }
      }
      return r;
    }
    function bnEquals(a) {
      return this.compareTo(a) == 0;
    }
    function bnMin(a) {
      return this.compareTo(a) < 0 ? this : a;
    }
    function bnMax(a) {
      return this.compareTo(a) > 0 ? this : a;
    }
    function bnpBitwiseTo(a, op, r) {
      var i, f, m = Math.min(a.t, this.t);
      for (i = 0; i < m; ++i) r[i] = op(this[i], a[i]);
      if (a.t < this.t) {
        f = a.s & this.DM;
        for (i = m; i < this.t; ++i) r[i] = op(this[i], f);
        r.t = this.t;
      } else {
        f = this.s & this.DM;
        for (i = m; i < a.t; ++i) r[i] = op(f, a[i]);
        r.t = a.t;
      }
      r.s = op(this.s, a.s);
      r.clamp();
    }
    function op_and(x, y) {
      return x & y;
    }
    function bnAnd(a) {
      var r = nbi();
      this.bitwiseTo(a, op_and, r);
      return r;
    }
    function op_or(x, y) {
      return x | y;
    }
    function bnOr(a) {
      var r = nbi();
      this.bitwiseTo(a, op_or, r);
      return r;
    }
    function op_xor(x, y) {
      return x ^ y;
    }
    function bnXor(a) {
      var r = nbi();
      this.bitwiseTo(a, op_xor, r);
      return r;
    }
    function op_andnot(x, y) {
      return x & ~y;
    }
    function bnAndNot(a) {
      var r = nbi();
      this.bitwiseTo(a, op_andnot, r);
      return r;
    }
    function bnNot() {
      var r = nbi();
      for (var i = 0; i < this.t; ++i) r[i] = this.DM & ~this[i];
      r.t = this.t;
      r.s = ~this.s;
      return r;
    }
    function bnShiftLeft(n) {
      var r = nbi();
      if (n < 0) this.rShiftTo(-n, r);
      else this.lShiftTo(n, r);
      return r;
    }
    function bnShiftRight(n) {
      var r = nbi();
      if (n < 0) this.lShiftTo(-n, r);
      else this.rShiftTo(n, r);
      return r;
    }
    function lbit(x) {
      if (x == 0) return -1;
      var r = 0;
      if ((x & 65535) == 0) {
        x >>= 16;
        r += 16;
      }
      if ((x & 255) == 0) {
        x >>= 8;
        r += 8;
      }
      if ((x & 15) == 0) {
        x >>= 4;
        r += 4;
      }
      if ((x & 3) == 0) {
        x >>= 2;
        r += 2;
      }
      if ((x & 1) == 0) ++r;
      return r;
    }
    function bnGetLowestSetBit() {
      for (var i = 0; i < this.t; ++i) if (this[i] != 0) return i * this.DB + lbit(this[i]);
      if (this.s < 0) return this.t * this.DB;
      return -1;
    }
    function cbit(x) {
      var r = 0;
      while (x != 0) {
        x &= x - 1;
        ++r;
      }
      return r;
    }
    function bnBitCount() {
      var r = 0, x = this.s & this.DM;
      for (var i = 0; i < this.t; ++i) r += cbit(this[i] ^ x);
      return r;
    }
    function bnTestBit(n) {
      var j = Math.floor(n / this.DB);
      if (j >= this.t) return this.s != 0;
      return (this[j] & 1 << n % this.DB) != 0;
    }
    function bnpChangeBit(n, op) {
      var r = BigInteger.ONE.shiftLeft(n);
      this.bitwiseTo(r, op, r);
      return r;
    }
    function bnSetBit(n) {
      return this.changeBit(n, op_or);
    }
    function bnClearBit(n) {
      return this.changeBit(n, op_andnot);
    }
    function bnFlipBit(n) {
      return this.changeBit(n, op_xor);
    }
    function bnpAddTo(a, r) {
      var i = 0, c = 0, m = Math.min(a.t, this.t);
      while (i < m) {
        c += this[i] + a[i];
        r[i++] = c & this.DM;
        c >>= this.DB;
      }
      if (a.t < this.t) {
        c += a.s;
        while (i < this.t) {
          c += this[i];
          r[i++] = c & this.DM;
          c >>= this.DB;
        }
        c += this.s;
      } else {
        c += this.s;
        while (i < a.t) {
          c += a[i];
          r[i++] = c & this.DM;
          c >>= this.DB;
        }
        c += a.s;
      }
      r.s = c < 0 ? -1 : 0;
      if (c > 0) r[i++] = c;
      else if (c < -1) r[i++] = this.DV + c;
      r.t = i;
      r.clamp();
    }
    function bnAdd(a) {
      var r = nbi();
      this.addTo(a, r);
      return r;
    }
    function bnSubtract(a) {
      var r = nbi();
      this.subTo(a, r);
      return r;
    }
    function bnMultiply(a) {
      var r = nbi();
      this.multiplyTo(a, r);
      return r;
    }
    function bnSquare() {
      var r = nbi();
      this.squareTo(r);
      return r;
    }
    function bnDivide(a) {
      var r = nbi();
      this.divRemTo(a, r, null);
      return r;
    }
    function bnRemainder(a) {
      var r = nbi();
      this.divRemTo(a, null, r);
      return r;
    }
    function bnDivideAndRemainder(a) {
      var q = nbi(), r = nbi();
      this.divRemTo(a, q, r);
      return new Array(q, r);
    }
    function bnpDMultiply(n) {
      this[this.t] = this.am(0, n - 1, this, 0, 0, this.t);
      ++this.t;
      this.clamp();
    }
    function bnpDAddOffset(n, w) {
      if (n == 0) return;
      while (this.t <= w) this[this.t++] = 0;
      this[w] += n;
      while (this[w] >= this.DV) {
        this[w] -= this.DV;
        if (++w >= this.t) this[this.t++] = 0;
        ++this[w];
      }
    }
    function NullExp() {}
    function nNop(x) {
      return x;
    }
    function nMulTo(x, y, r) {
      x.multiplyTo(y, r);
    }
    function nSqrTo(x, r) {
      x.squareTo(r);
    }
    NullExp.prototype.convert = nNop;
    NullExp.prototype.revert = nNop;
    NullExp.prototype.mulTo = nMulTo;
    NullExp.prototype.sqrTo = nSqrTo;
    function bnPow(e) {
      return this.exp(e, new NullExp());
    }
    function bnpMultiplyLowerTo(a, n, r) {
      var i = Math.min(this.t + a.t, n);
      r.s = 0;
      r.t = i;
      while (i > 0) r[--i] = 0;
      var j;
      for (j = r.t - this.t; i < j; ++i) r[i + this.t] = this.am(0, a[i], r, i, 0, this.t);
      for (j = Math.min(a.t, n); i < j; ++i) this.am(0, a[i], r, i, 0, n - i);
      r.clamp();
    }
    function bnpMultiplyUpperTo(a, n, r) {
      --n;
      var i = r.t = this.t + a.t - n;
      r.s = 0;
      while (--i >= 0) r[i] = 0;
      for (i = Math.max(n - this.t, 0); i < a.t; ++i) r[this.t + i - n] = this.am(n - i, a[i], r, 0, 0, this.t + i - n);
      r.clamp();
      r.drShiftTo(1, r);
    }
    function Barrett(m) {
      this.r2 = nbi();
      this.q3 = nbi();
      BigInteger.ONE.dlShiftTo(2 * m.t, this.r2);
      this.mu = this.r2.divide(m);
      this.m = m;
    }
    function barrettConvert(x) {
      if (x.s < 0 || x.t > 2 * this.m.t) return x.mod(this.m);
      else if (x.compareTo(this.m) < 0) return x;
      else {
        var r = nbi();
        x.copyTo(r);
        this.reduce(r);
        return r;
      }
    }
    function barrettRevert(x) {
      return x;
    }
    function barrettReduce(x) {
      x.drShiftTo(this.m.t - 1, this.r2);
      if (x.t > this.m.t + 1) {
        x.t = this.m.t + 1;
        x.clamp();
      }
      this.mu.multiplyUpperTo(this.r2, this.m.t + 1, this.q3);
      this.m.multiplyLowerTo(this.q3, this.m.t + 1, this.r2);
      while (x.compareTo(this.r2) < 0) x.dAddOffset(1, this.m.t + 1);
      x.subTo(this.r2, x);
      while (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
    }
    function barrettSqrTo(x, r) {
      x.squareTo(r);
      this.reduce(r);
    }
    function barrettMulTo(x, y, r) {
      x.multiplyTo(y, r);
      this.reduce(r);
    }
    Barrett.prototype.convert = barrettConvert;
    Barrett.prototype.revert = barrettRevert;
    Barrett.prototype.reduce = barrettReduce;
    Barrett.prototype.mulTo = barrettMulTo;
    Barrett.prototype.sqrTo = barrettSqrTo;
    function bnModPow(e, m) {
      var i = e.bitLength(), k, r = nbv(1), z;
      if (i <= 0) return r;
      else if (i < 18) k = 1;
      else if (i < 48) k = 3;
      else if (i < 144) k = 4;
      else if (i < 768) k = 5;
      else k = 6;
      if (i < 8) z = new Classic(m);
      else if (m.isEven()) z = new Barrett(m);
      else z = new Montgomery(m);
      var g = new Array(), n = 3, k1 = k - 1, km = (1 << k) - 1;
      g[1] = z.convert(this);
      if (k > 1) {
        var g2 = nbi();
        z.sqrTo(g[1], g2);
        while (n <= km) {
          g[n] = nbi();
          z.mulTo(g2, g[n - 2], g[n]);
          n += 2;
        }
      }
      var j = e.t - 1, w, is1 = true, r2 = nbi(), t;
      i = nbits(e[j]) - 1;
      while (j >= 0) {
        if (i >= k1) w = e[j] >> i - k1 & km;
        else {
          w = (e[j] & (1 << i + 1) - 1) << k1 - i;
          if (j > 0) w |= e[j - 1] >> this.DB + i - k1;
        }
        n = k;
        while ((w & 1) == 0) {
          w >>= 1;
          --n;
        }
        if ((i -= n) < 0) {
          i += this.DB;
          --j;
        }
        if (is1) {
          g[w].copyTo(r);
          is1 = false;
        } else {
          while (n > 1) {
            z.sqrTo(r, r2);
            z.sqrTo(r2, r);
            n -= 2;
          }
          if (n > 0) z.sqrTo(r, r2);
          else {
            t = r;
            r = r2;
            r2 = t;
          }
          z.mulTo(r2, g[w], r);
        }
        while (j >= 0 && (e[j] & 1 << i) == 0) {
          z.sqrTo(r, r2);
          t = r;
          r = r2;
          r2 = t;
          if (--i < 0) {
            i = this.DB - 1;
            --j;
          }
        }
      }
      return z.revert(r);
    }
    function bnGCD(a) {
      var x = this.s < 0 ? this.negate() : this.clone();
      var y = a.s < 0 ? a.negate() : a.clone();
      if (x.compareTo(y) < 0) {
        var t = x;
        x = y;
        y = t;
      }
      var i = x.getLowestSetBit(), g = y.getLowestSetBit();
      if (g < 0) return x;
      if (i < g) g = i;
      if (g > 0) {
        x.rShiftTo(g, x);
        y.rShiftTo(g, y);
      }
      while (x.signum() > 0) {
        if ((i = x.getLowestSetBit()) > 0) x.rShiftTo(i, x);
        if ((i = y.getLowestSetBit()) > 0) y.rShiftTo(i, y);
        if (x.compareTo(y) >= 0) {
          x.subTo(y, x);
          x.rShiftTo(1, x);
        } else {
          y.subTo(x, y);
          y.rShiftTo(1, y);
        }
      }
      if (g > 0) y.lShiftTo(g, y);
      return y;
    }
    function bnpModInt(n) {
      if (n <= 0) return 0;
      var d = this.DV % n, r = this.s < 0 ? n - 1 : 0;
      if (this.t > 0) if (d == 0) r = this[0] % n;
      else for (var i = this.t - 1; i >= 0; --i) r = (d * r + this[i]) % n;
      return r;
    }
    function bnModInverse(m) {
      var ac = m.isEven();
      if (this.isEven() && ac || m.signum() == 0) return BigInteger.ZERO;
      var u = m.clone(), v = this.clone();
      var a = nbv(1), b = nbv(0), c = nbv(0), d = nbv(1);
      while (u.signum() != 0) {
        while (u.isEven()) {
          u.rShiftTo(1, u);
          if (ac) {
            if (!a.isEven() || !b.isEven()) {
              a.addTo(this, a);
              b.subTo(m, b);
            }
            a.rShiftTo(1, a);
          } else if (!b.isEven()) b.subTo(m, b);
          b.rShiftTo(1, b);
        }
        while (v.isEven()) {
          v.rShiftTo(1, v);
          if (ac) {
            if (!c.isEven() || !d.isEven()) {
              c.addTo(this, c);
              d.subTo(m, d);
            }
            c.rShiftTo(1, c);
          } else if (!d.isEven()) d.subTo(m, d);
          d.rShiftTo(1, d);
        }
        if (u.compareTo(v) >= 0) {
          u.subTo(v, u);
          if (ac) a.subTo(c, a);
          b.subTo(d, b);
        } else {
          v.subTo(u, v);
          if (ac) c.subTo(a, c);
          d.subTo(b, d);
        }
      }
      if (v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
      if (d.compareTo(m) >= 0) return d.subtract(m);
      if (d.signum() < 0) d.addTo(m, d);
      else return d;
      if (d.signum() < 0) return d.add(m);
      else return d;
    }
    var lowprimes = [
      2,
      3,
      5,
      7,
      11,
      13,
      17,
      19,
      23,
      29,
      31,
      37,
      41,
      43,
      47,
      53,
      59,
      61,
      67,
      71,
      73,
      79,
      83,
      89,
      97,
      101,
      103,
      107,
      109,
      113,
      127,
      131,
      137,
      139,
      149,
      151,
      157,
      163,
      167,
      173,
      179,
      181,
      191,
      193,
      197,
      199,
      211,
      223,
      227,
      229,
      233,
      239,
      241,
      251,
      257,
      263,
      269,
      271,
      277,
      281,
      283,
      293,
      307,
      311,
      313,
      317,
      331,
      337,
      347,
      349,
      353,
      359,
      367,
      373,
      379,
      383,
      389,
      397,
      401,
      409,
      419,
      421,
      431,
      433,
      439,
      443,
      449,
      457,
      461,
      463,
      467,
      479,
      487,
      491,
      499,
      503,
      509,
      521,
      523,
      541,
      547,
      557,
      563,
      569,
      571,
      577,
      587,
      593,
      599,
      601,
      607,
      613,
      617,
      619,
      631,
      641,
      643,
      647,
      653,
      659,
      661,
      673,
      677,
      683,
      691,
      701,
      709,
      719,
      727,
      733,
      739,
      743,
      751,
      757,
      761,
      769,
      773,
      787,
      797,
      809,
      811,
      821,
      823,
      827,
      829,
      839,
      853,
      857,
      859,
      863,
      877,
      881,
      883,
      887,
      907,
      911,
      919,
      929,
      937,
      941,
      947,
      953,
      967,
      971,
      977,
      983,
      991,
      997
    ];
    var lplim = (1 << 26) / lowprimes[lowprimes.length - 1];
    function bnIsProbablePrime(t) {
      var i, x = this.abs();
      if (x.t == 1 && x[0] <= lowprimes[lowprimes.length - 1]) {
        for (i = 0; i < lowprimes.length; ++i) if (x[0] == lowprimes[i]) return true;
        return false;
      }
      if (x.isEven()) return false;
      i = 1;
      while (i < lowprimes.length) {
        var m = lowprimes[i], j = i + 1;
        while (j < lowprimes.length && m < lplim) m *= lowprimes[j++];
        m = x.modInt(m);
        while (i < j) if (m % lowprimes[i++] == 0) return false;
      }
      return x.millerRabin(t);
    }
    function bnpMillerRabin(t) {
      var n1 = this.subtract(BigInteger.ONE);
      var k = n1.getLowestSetBit();
      if (k <= 0) return false;
      var r = n1.shiftRight(k);
      t = t + 1 >> 1;
      if (t > lowprimes.length) t = lowprimes.length;
      var a = nbi();
      for (var i = 0; i < t; ++i) {
        a.fromInt(lowprimes[Math.floor(Math.random() * lowprimes.length)]);
        var y = a.modPow(r, this);
        if (y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
          var j = 1;
          while (j++ < k && y.compareTo(n1) != 0) {
            y = y.modPowInt(2, this);
            if (y.compareTo(BigInteger.ONE) == 0) return false;
          }
          if (y.compareTo(n1) != 0) return false;
        }
      }
      return true;
    }
    BigInteger.prototype.chunkSize = bnpChunkSize;
    BigInteger.prototype.toRadix = bnpToRadix;
    BigInteger.prototype.fromRadix = bnpFromRadix;
    BigInteger.prototype.fromNumber = bnpFromNumber;
    BigInteger.prototype.bitwiseTo = bnpBitwiseTo;
    BigInteger.prototype.changeBit = bnpChangeBit;
    BigInteger.prototype.addTo = bnpAddTo;
    BigInteger.prototype.dMultiply = bnpDMultiply;
    BigInteger.prototype.dAddOffset = bnpDAddOffset;
    BigInteger.prototype.multiplyLowerTo = bnpMultiplyLowerTo;
    BigInteger.prototype.multiplyUpperTo = bnpMultiplyUpperTo;
    BigInteger.prototype.modInt = bnpModInt;
    BigInteger.prototype.millerRabin = bnpMillerRabin;
    BigInteger.prototype.clone = bnClone;
    BigInteger.prototype.intValue = bnIntValue;
    BigInteger.prototype.byteValue = bnByteValue;
    BigInteger.prototype.shortValue = bnShortValue;
    BigInteger.prototype.signum = bnSigNum;
    BigInteger.prototype.toByteArray = bnToByteArray;
    BigInteger.prototype.equals = bnEquals;
    BigInteger.prototype.min = bnMin;
    BigInteger.prototype.max = bnMax;
    BigInteger.prototype.and = bnAnd;
    BigInteger.prototype.or = bnOr;
    BigInteger.prototype.xor = bnXor;
    BigInteger.prototype.andNot = bnAndNot;
    BigInteger.prototype.not = bnNot;
    BigInteger.prototype.shiftLeft = bnShiftLeft;
    BigInteger.prototype.shiftRight = bnShiftRight;
    BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
    BigInteger.prototype.bitCount = bnBitCount;
    BigInteger.prototype.testBit = bnTestBit;
    BigInteger.prototype.setBit = bnSetBit;
    BigInteger.prototype.clearBit = bnClearBit;
    BigInteger.prototype.flipBit = bnFlipBit;
    BigInteger.prototype.add = bnAdd;
    BigInteger.prototype.subtract = bnSubtract;
    BigInteger.prototype.multiply = bnMultiply;
    BigInteger.prototype.divide = bnDivide;
    BigInteger.prototype.remainder = bnRemainder;
    BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
    BigInteger.prototype.modPow = bnModPow;
    BigInteger.prototype.modInverse = bnModInverse;
    BigInteger.prototype.pow = bnPow;
    BigInteger.prototype.gcd = bnGCD;
    BigInteger.prototype.isProbablePrime = bnIsProbablePrime;
    BigInteger.prototype.square = bnSquare;
    var Int128 = BigInteger;
    Int128.prototype.IsNegative = function() {
      if (this.compareTo(Int128.ZERO) == -1) return true;
      else return false;
    };
    Int128.op_Equality = function(val1, val2) {
      if (val1.compareTo(val2) == 0) return true;
      else return false;
    };
    Int128.op_Inequality = function(val1, val2) {
      if (val1.compareTo(val2) != 0) return true;
      else return false;
    };
    Int128.op_GreaterThan = function(val1, val2) {
      if (val1.compareTo(val2) > 0) return true;
      else return false;
    };
    Int128.op_LessThan = function(val1, val2) {
      if (val1.compareTo(val2) < 0) return true;
      else return false;
    };
    Int128.op_Addition = function(lhs, rhs) {
      return new Int128(lhs).add(new Int128(rhs));
    };
    Int128.op_Subtraction = function(lhs, rhs) {
      return new Int128(lhs).subtract(new Int128(rhs));
    };
    Int128.Int128Mul = function(lhs, rhs) {
      return new Int128(lhs).multiply(new Int128(rhs));
    };
    Int128.op_Division = function(lhs, rhs) {
      return lhs.divide(rhs);
    };
    Int128.prototype.ToDouble = function() {
      return parseFloat(this.toString());
    };
    if (typeof Inherit == "undefined") var Inherit = function(ce, ce2) {
      var p;
      if (typeof Object.getOwnPropertyNames == "undefined") {
        for (p in ce2.prototype) if (typeof ce.prototype[p] == "undefined" || ce.prototype[p] == Object.prototype[p]) ce.prototype[p] = ce2.prototype[p];
        for (p in ce2) if (typeof ce[p] == "undefined") ce[p] = ce2[p];
        ce.$baseCtor = ce2;
      } else {
        var props = Object.getOwnPropertyNames(ce2.prototype);
        for (var i = 0; i < props.length; i++) if (typeof Object.getOwnPropertyDescriptor(ce.prototype, props[i]) == "undefined") Object.defineProperty(ce.prototype, props[i], Object.getOwnPropertyDescriptor(ce2.prototype, props[i]));
        for (p in ce2) if (typeof ce[p] == "undefined") ce[p] = ce2[p];
        ce.$baseCtor = ce2;
      }
    };
    ClipperLib.Path = function() {
      return [];
    };
    ClipperLib.Paths = function() {
      return [];
    };
    ClipperLib.DoublePoint = function() {
      var a = arguments;
      this.X = 0;
      this.Y = 0;
      if (a.length == 1) {
        this.X = a[0].X;
        this.Y = a[0].Y;
      } else if (a.length == 2) {
        this.X = a[0];
        this.Y = a[1];
      }
    };
    ClipperLib.DoublePoint0 = function() {
      this.X = 0;
      this.Y = 0;
    };
    ClipperLib.DoublePoint1 = function(dp) {
      this.X = dp.X;
      this.Y = dp.Y;
    };
    ClipperLib.DoublePoint2 = function(x, y) {
      this.X = x;
      this.Y = y;
    };
    ClipperLib.PolyNode = function() {
      this.m_Parent = null;
      this.m_polygon = new ClipperLib.Path();
      this.m_Index = 0;
      this.m_jointype = 0;
      this.m_endtype = 0;
      this.m_Childs = [];
      this.IsOpen = false;
    };
    ClipperLib.PolyNode.prototype.IsHoleNode = function() {
      var result = true;
      var node = this.m_Parent;
      while (node !== null) {
        result = !result;
        node = node.m_Parent;
      }
      return result;
    };
    ClipperLib.PolyNode.prototype.ChildCount = function() {
      return this.m_Childs.length;
    };
    ClipperLib.PolyNode.prototype.Contour = function() {
      return this.m_polygon;
    };
    ClipperLib.PolyNode.prototype.AddChild = function(Child) {
      var cnt = this.m_Childs.length;
      this.m_Childs.push(Child);
      Child.m_Parent = this;
      Child.m_Index = cnt;
    };
    ClipperLib.PolyNode.prototype.GetNext = function() {
      if (this.m_Childs.length > 0) return this.m_Childs[0];
      else return this.GetNextSiblingUp();
    };
    ClipperLib.PolyNode.prototype.GetNextSiblingUp = function() {
      if (this.m_Parent === null) return null;
      else if (this.m_Index == this.m_Parent.m_Childs.length - 1) return this.m_Parent.GetNextSiblingUp();
      else return this.m_Parent.m_Childs[this.m_Index + 1];
    };
    ClipperLib.PolyNode.prototype.Childs = function() {
      return this.m_Childs;
    };
    ClipperLib.PolyNode.prototype.Parent = function() {
      return this.m_Parent;
    };
    ClipperLib.PolyNode.prototype.IsHole = function() {
      return this.IsHoleNode();
    };
    ClipperLib.PolyTree = function() {
      this.m_AllPolys = [];
      ClipperLib.PolyNode.call(this);
    };
    ClipperLib.PolyTree.prototype.Clear = function() {
      for (var i = 0, ilen = this.m_AllPolys.length; i < ilen; i++) this.m_AllPolys[i] = null;
      this.m_AllPolys.length = 0;
      this.m_Childs.length = 0;
    };
    ClipperLib.PolyTree.prototype.GetFirst = function() {
      if (this.m_Childs.length > 0) return this.m_Childs[0];
      else return null;
    };
    ClipperLib.PolyTree.prototype.Total = function() {
      return this.m_AllPolys.length;
    };
    Inherit(ClipperLib.PolyTree, ClipperLib.PolyNode);
    ClipperLib.Math_Abs_Int64 = ClipperLib.Math_Abs_Int32 = ClipperLib.Math_Abs_Double = function(a) {
      return Math.abs(a);
    };
    ClipperLib.Math_Max_Int32_Int32 = function(a, b) {
      return Math.max(a, b);
    };
    if (browser.msie || browser.opera || browser.safari) ClipperLib.Cast_Int32 = function(a) {
      return a | 0;
    };
    else ClipperLib.Cast_Int32 = function(a) {
      return ~~a;
    };
    if (browser.chrome) ClipperLib.Cast_Int64 = function(a) {
      if (a < -2147483648 || a > 2147483647) return a < 0 ? Math.ceil(a) : Math.floor(a);
      else return ~~a;
    };
    else if (browser.firefox && typeof Number.toInteger == "function") ClipperLib.Cast_Int64 = function(a) {
      return Number.toInteger(a);
    };
    else if (browser.msie7 || browser.msie8) ClipperLib.Cast_Int64 = function(a) {
      return parseInt(a, 10);
    };
    else if (browser.msie) ClipperLib.Cast_Int64 = function(a) {
      if (a < -2147483648 || a > 2147483647) return a < 0 ? Math.ceil(a) : Math.floor(a);
      return a | 0;
    };
    else ClipperLib.Cast_Int64 = function(a) {
      return a < 0 ? Math.ceil(a) : Math.floor(a);
    };
    ClipperLib.Clear = function(a) {
      a.length = 0;
    };
    ClipperLib.PI = 3.141592653589793;
    ClipperLib.PI2 = 6.283185307179586;
    ClipperLib.IntPoint = function() {
      var a = arguments, alen = a.length;
      this.X = 0;
      this.Y = 0;
      if (use_xyz) {
        this.Z = 0;
        if (alen == 3) {
          this.X = a[0];
          this.Y = a[1];
          this.Z = a[2];
        } else if (alen == 2) {
          this.X = a[0];
          this.Y = a[1];
          this.Z = 0;
        } else if (alen == 1) {
          if (a[0] instanceof ClipperLib.DoublePoint) {
            var dp = a[0];
            this.X = ClipperLib.Clipper.Round(dp.X);
            this.Y = ClipperLib.Clipper.Round(dp.Y);
            this.Z = 0;
          } else {
            var pt = a[0];
            if (typeof pt.Z == "undefined") pt.Z = 0;
            this.X = pt.X;
            this.Y = pt.Y;
            this.Z = pt.Z;
          }
        } else {
          this.X = 0;
          this.Y = 0;
          this.Z = 0;
        }
      } else if (alen == 2) {
        this.X = a[0];
        this.Y = a[1];
      } else if (alen == 1) {
        if (a[0] instanceof ClipperLib.DoublePoint) {
          var dp = a[0];
          this.X = ClipperLib.Clipper.Round(dp.X);
          this.Y = ClipperLib.Clipper.Round(dp.Y);
        } else {
          var pt = a[0];
          this.X = pt.X;
          this.Y = pt.Y;
        }
      } else {
        this.X = 0;
        this.Y = 0;
      }
    };
    ClipperLib.IntPoint.op_Equality = function(a, b) {
      return a.X == b.X && a.Y == b.Y;
    };
    ClipperLib.IntPoint.op_Inequality = function(a, b) {
      return a.X != b.X || a.Y != b.Y;
    };
    if (use_xyz) {
      ClipperLib.IntPoint0 = function() {
        this.X = 0;
        this.Y = 0;
        this.Z = 0;
      };
      ClipperLib.IntPoint1 = function(pt) {
        this.X = pt.X;
        this.Y = pt.Y;
        this.Z = pt.Z;
      };
      ClipperLib.IntPoint1dp = function(dp) {
        this.X = ClipperLib.Clipper.Round(dp.X);
        this.Y = ClipperLib.Clipper.Round(dp.Y);
        this.Z = 0;
      };
      ClipperLib.IntPoint2 = function(x, y) {
        this.X = x;
        this.Y = y;
        this.Z = 0;
      };
      ClipperLib.IntPoint3 = function(x, y, z) {
        this.X = x;
        this.Y = y;
        this.Z = z;
      };
    } else {
      ClipperLib.IntPoint0 = function() {
        this.X = 0;
        this.Y = 0;
      };
      ClipperLib.IntPoint1 = function(pt) {
        this.X = pt.X;
        this.Y = pt.Y;
      };
      ClipperLib.IntPoint1dp = function(dp) {
        this.X = ClipperLib.Clipper.Round(dp.X);
        this.Y = ClipperLib.Clipper.Round(dp.Y);
      };
      ClipperLib.IntPoint2 = function(x, y) {
        this.X = x;
        this.Y = y;
      };
    }
    ClipperLib.IntRect = function() {
      var a = arguments, alen = a.length;
      if (alen == 4) {
        this.left = a[0];
        this.top = a[1];
        this.right = a[2];
        this.bottom = a[3];
      } else if (alen == 1) {
        this.left = ir.left;
        this.top = ir.top;
        this.right = ir.right;
        this.bottom = ir.bottom;
      } else {
        this.left = 0;
        this.top = 0;
        this.right = 0;
        this.bottom = 0;
      }
    };
    ClipperLib.IntRect0 = function() {
      this.left = 0;
      this.top = 0;
      this.right = 0;
      this.bottom = 0;
    };
    ClipperLib.IntRect1 = function(ir) {
      this.left = ir.left;
      this.top = ir.top;
      this.right = ir.right;
      this.bottom = ir.bottom;
    };
    ClipperLib.IntRect4 = function(l, t, r, b) {
      this.left = l;
      this.top = t;
      this.right = r;
      this.bottom = b;
    };
    ClipperLib.ClipType = {
      ctIntersection: 0,
      ctUnion: 1,
      ctDifference: 2,
      ctXor: 3
    };
    ClipperLib.PolyType = {
      ptSubject: 0,
      ptClip: 1
    };
    ClipperLib.PolyFillType = {
      pftEvenOdd: 0,
      pftNonZero: 1,
      pftPositive: 2,
      pftNegative: 3
    };
    ClipperLib.JoinType = {
      jtSquare: 0,
      jtRound: 1,
      jtMiter: 2
    };
    ClipperLib.EndType = {
      etOpenSquare: 0,
      etOpenRound: 1,
      etOpenButt: 2,
      etClosedLine: 3,
      etClosedPolygon: 4
    };
    if (use_deprecated) ClipperLib.EndType_ = {
      etSquare: 0,
      etRound: 1,
      etButt: 2,
      etClosed: 3
    };
    ClipperLib.EdgeSide = {
      esLeft: 0,
      esRight: 1
    };
    ClipperLib.Direction = {
      dRightToLeft: 0,
      dLeftToRight: 1
    };
    ClipperLib.TEdge = function() {
      this.Bot = new ClipperLib.IntPoint();
      this.Curr = new ClipperLib.IntPoint();
      this.Top = new ClipperLib.IntPoint();
      this.Delta = new ClipperLib.IntPoint();
      this.Dx = 0;
      this.PolyTyp = ClipperLib.PolyType.ptSubject;
      this.Side = ClipperLib.EdgeSide.esLeft;
      this.WindDelta = 0;
      this.WindCnt = 0;
      this.WindCnt2 = 0;
      this.OutIdx = 0;
      this.Next = null;
      this.Prev = null;
      this.NextInLML = null;
      this.NextInAEL = null;
      this.PrevInAEL = null;
      this.NextInSEL = null;
      this.PrevInSEL = null;
    };
    ClipperLib.IntersectNode = function() {
      this.Edge1 = null;
      this.Edge2 = null;
      this.Pt = new ClipperLib.IntPoint();
    };
    ClipperLib.MyIntersectNodeSort = function() {};
    ClipperLib.MyIntersectNodeSort.Compare = function(node1, node2) {
      return node2.Pt.Y - node1.Pt.Y;
    };
    ClipperLib.LocalMinima = function() {
      this.Y = 0;
      this.LeftBound = null;
      this.RightBound = null;
      this.Next = null;
    };
    ClipperLib.Scanbeam = function() {
      this.Y = 0;
      this.Next = null;
    };
    ClipperLib.OutRec = function() {
      this.Idx = 0;
      this.IsHole = false;
      this.IsOpen = false;
      this.FirstLeft = null;
      this.Pts = null;
      this.BottomPt = null;
      this.PolyNode = null;
    };
    ClipperLib.OutPt = function() {
      this.Idx = 0;
      this.Pt = new ClipperLib.IntPoint();
      this.Next = null;
      this.Prev = null;
    };
    ClipperLib.Join = function() {
      this.OutPt1 = null;
      this.OutPt2 = null;
      this.OffPt = new ClipperLib.IntPoint();
    };
    ClipperLib.ClipperBase = function() {
      this.m_MinimaList = null;
      this.m_CurrentLM = null;
      this.m_edges = new Array();
      this.m_UseFullRange = false;
      this.m_HasOpenPaths = false;
      this.PreserveCollinear = false;
      this.m_MinimaList = null;
      this.m_CurrentLM = null;
      this.m_UseFullRange = false;
      this.m_HasOpenPaths = false;
    };
    ClipperLib.ClipperBase.horizontal = -9007199254740992;
    ClipperLib.ClipperBase.Skip = -2;
    ClipperLib.ClipperBase.Unassigned = -1;
    ClipperLib.ClipperBase.tolerance = 1e-20;
    if (use_int32) {
      ClipperLib.ClipperBase.loRange = 46340;
      ClipperLib.ClipperBase.hiRange = 46340;
    } else {
      ClipperLib.ClipperBase.loRange = 47453132;
      ClipperLib.ClipperBase.hiRange = 0xfffffffffffff;
    }
    ClipperLib.ClipperBase.near_zero = function(val) {
      return val > -ClipperLib.ClipperBase.tolerance && val < ClipperLib.ClipperBase.tolerance;
    };
    ClipperLib.ClipperBase.IsHorizontal = function(e) {
      return e.Delta.Y === 0;
    };
    ClipperLib.ClipperBase.prototype.PointIsVertex = function(pt, pp) {
      var pp2 = pp;
      do {
        if (ClipperLib.IntPoint.op_Equality(pp2.Pt, pt)) return true;
        pp2 = pp2.Next;
      } while (pp2 != pp);
      return false;
    };
    ClipperLib.ClipperBase.prototype.PointOnLineSegment = function(pt, linePt1, linePt2, UseFullRange) {
      if (UseFullRange) return pt.X == linePt1.X && pt.Y == linePt1.Y || pt.X == linePt2.X && pt.Y == linePt2.Y || pt.X > linePt1.X == pt.X < linePt2.X && pt.Y > linePt1.Y == pt.Y < linePt2.Y && Int128.op_Equality(Int128.Int128Mul(pt.X - linePt1.X, linePt2.Y - linePt1.Y), Int128.Int128Mul(linePt2.X - linePt1.X, pt.Y - linePt1.Y));
      else return pt.X == linePt1.X && pt.Y == linePt1.Y || pt.X == linePt2.X && pt.Y == linePt2.Y || pt.X > linePt1.X == pt.X < linePt2.X && pt.Y > linePt1.Y == pt.Y < linePt2.Y && (pt.X - linePt1.X) * (linePt2.Y - linePt1.Y) == (linePt2.X - linePt1.X) * (pt.Y - linePt1.Y);
    };
    ClipperLib.ClipperBase.prototype.PointOnPolygon = function(pt, pp, UseFullRange) {
      var pp2 = pp;
      while (true) {
        if (this.PointOnLineSegment(pt, pp2.Pt, pp2.Next.Pt, UseFullRange)) return true;
        pp2 = pp2.Next;
        if (pp2 == pp) break;
      }
      return false;
    };
    ClipperLib.ClipperBase.prototype.SlopesEqual = ClipperLib.ClipperBase.SlopesEqual = function() {
      var a = arguments, alen = a.length;
      var e1, e2, pt1, pt2, pt3, pt4, UseFullRange;
      if (alen == 3) {
        e1 = a[0];
        e2 = a[1];
        UseFullRange = a[2];
        if (UseFullRange) return Int128.op_Equality(Int128.Int128Mul(e1.Delta.Y, e2.Delta.X), Int128.Int128Mul(e1.Delta.X, e2.Delta.Y));
        else return ClipperLib.Cast_Int64(e1.Delta.Y * e2.Delta.X) == ClipperLib.Cast_Int64(e1.Delta.X * e2.Delta.Y);
      } else if (alen == 4) {
        pt1 = a[0];
        pt2 = a[1];
        pt3 = a[2];
        UseFullRange = a[3];
        if (UseFullRange) return Int128.op_Equality(Int128.Int128Mul(pt1.Y - pt2.Y, pt2.X - pt3.X), Int128.Int128Mul(pt1.X - pt2.X, pt2.Y - pt3.Y));
        else return ClipperLib.Cast_Int64((pt1.Y - pt2.Y) * (pt2.X - pt3.X)) - ClipperLib.Cast_Int64((pt1.X - pt2.X) * (pt2.Y - pt3.Y)) === 0;
      } else {
        pt1 = a[0];
        pt2 = a[1];
        pt3 = a[2];
        pt4 = a[3];
        UseFullRange = a[4];
        if (UseFullRange) return Int128.op_Equality(Int128.Int128Mul(pt1.Y - pt2.Y, pt3.X - pt4.X), Int128.Int128Mul(pt1.X - pt2.X, pt3.Y - pt4.Y));
        else return ClipperLib.Cast_Int64((pt1.Y - pt2.Y) * (pt3.X - pt4.X)) - ClipperLib.Cast_Int64((pt1.X - pt2.X) * (pt3.Y - pt4.Y)) === 0;
      }
    };
    ClipperLib.ClipperBase.SlopesEqual3 = function(e1, e2, UseFullRange) {
      if (UseFullRange) return Int128.op_Equality(Int128.Int128Mul(e1.Delta.Y, e2.Delta.X), Int128.Int128Mul(e1.Delta.X, e2.Delta.Y));
      else return ClipperLib.Cast_Int64(e1.Delta.Y * e2.Delta.X) == ClipperLib.Cast_Int64(e1.Delta.X * e2.Delta.Y);
    };
    ClipperLib.ClipperBase.SlopesEqual4 = function(pt1, pt2, pt3, UseFullRange) {
      if (UseFullRange) return Int128.op_Equality(Int128.Int128Mul(pt1.Y - pt2.Y, pt2.X - pt3.X), Int128.Int128Mul(pt1.X - pt2.X, pt2.Y - pt3.Y));
      else return ClipperLib.Cast_Int64((pt1.Y - pt2.Y) * (pt2.X - pt3.X)) - ClipperLib.Cast_Int64((pt1.X - pt2.X) * (pt2.Y - pt3.Y)) === 0;
    };
    ClipperLib.ClipperBase.SlopesEqual5 = function(pt1, pt2, pt3, pt4, UseFullRange) {
      if (UseFullRange) return Int128.op_Equality(Int128.Int128Mul(pt1.Y - pt2.Y, pt3.X - pt4.X), Int128.Int128Mul(pt1.X - pt2.X, pt3.Y - pt4.Y));
      else return ClipperLib.Cast_Int64((pt1.Y - pt2.Y) * (pt3.X - pt4.X)) - ClipperLib.Cast_Int64((pt1.X - pt2.X) * (pt3.Y - pt4.Y)) === 0;
    };
    ClipperLib.ClipperBase.prototype.Clear = function() {
      this.DisposeLocalMinimaList();
      for (var i = 0, ilen = this.m_edges.length; i < ilen; ++i) {
        for (var j = 0, jlen = this.m_edges[i].length; j < jlen; ++j) this.m_edges[i][j] = null;
        ClipperLib.Clear(this.m_edges[i]);
      }
      ClipperLib.Clear(this.m_edges);
      this.m_UseFullRange = false;
      this.m_HasOpenPaths = false;
    };
    ClipperLib.ClipperBase.prototype.DisposeLocalMinimaList = function() {
      while (this.m_MinimaList !== null) {
        var tmpLm = this.m_MinimaList.Next;
        this.m_MinimaList = null;
        this.m_MinimaList = tmpLm;
      }
      this.m_CurrentLM = null;
    };
    ClipperLib.ClipperBase.prototype.RangeTest = function(Pt, useFullRange) {
      if (useFullRange.Value) {
        if (Pt.X > ClipperLib.ClipperBase.hiRange || Pt.Y > ClipperLib.ClipperBase.hiRange || -Pt.X > ClipperLib.ClipperBase.hiRange || -Pt.Y > ClipperLib.ClipperBase.hiRange) ClipperLib.Error("Coordinate outside allowed range in RangeTest().");
      } else if (Pt.X > ClipperLib.ClipperBase.loRange || Pt.Y > ClipperLib.ClipperBase.loRange || -Pt.X > ClipperLib.ClipperBase.loRange || -Pt.Y > ClipperLib.ClipperBase.loRange) {
        useFullRange.Value = true;
        this.RangeTest(Pt, useFullRange);
      }
    };
    ClipperLib.ClipperBase.prototype.InitEdge = function(e, eNext, ePrev, pt) {
      e.Next = eNext;
      e.Prev = ePrev;
      e.Curr.X = pt.X;
      e.Curr.Y = pt.Y;
      e.OutIdx = -1;
    };
    ClipperLib.ClipperBase.prototype.InitEdge2 = function(e, polyType) {
      if (e.Curr.Y >= e.Next.Curr.Y) {
        e.Bot.X = e.Curr.X;
        e.Bot.Y = e.Curr.Y;
        e.Top.X = e.Next.Curr.X;
        e.Top.Y = e.Next.Curr.Y;
      } else {
        e.Top.X = e.Curr.X;
        e.Top.Y = e.Curr.Y;
        e.Bot.X = e.Next.Curr.X;
        e.Bot.Y = e.Next.Curr.Y;
      }
      this.SetDx(e);
      e.PolyTyp = polyType;
    };
    ClipperLib.ClipperBase.prototype.FindNextLocMin = function(E) {
      var E2;
      for (;;) {
        while (ClipperLib.IntPoint.op_Inequality(E.Bot, E.Prev.Bot) || ClipperLib.IntPoint.op_Equality(E.Curr, E.Top)) E = E.Next;
        if (E.Dx != ClipperLib.ClipperBase.horizontal && E.Prev.Dx != ClipperLib.ClipperBase.horizontal) break;
        while (E.Prev.Dx == ClipperLib.ClipperBase.horizontal) E = E.Prev;
        E2 = E;
        while (E.Dx == ClipperLib.ClipperBase.horizontal) E = E.Next;
        if (E.Top.Y == E.Prev.Bot.Y) continue;
        if (E2.Prev.Bot.X < E.Bot.X) E = E2;
        break;
      }
      return E;
    };
    ClipperLib.ClipperBase.prototype.ProcessBound = function(E, IsClockwise) {
      var EStart = E, Result = E;
      var Horz;
      var StartX;
      if (E.Dx == ClipperLib.ClipperBase.horizontal) {
        if (IsClockwise) StartX = E.Prev.Bot.X;
        else StartX = E.Next.Bot.X;
        if (E.Bot.X != StartX) this.ReverseHorizontal(E);
      }
      if (Result.OutIdx != ClipperLib.ClipperBase.Skip) {
        if (IsClockwise) {
          while (Result.Top.Y == Result.Next.Bot.Y && Result.Next.OutIdx != ClipperLib.ClipperBase.Skip) Result = Result.Next;
          if (Result.Dx == ClipperLib.ClipperBase.horizontal && Result.Next.OutIdx != ClipperLib.ClipperBase.Skip) {
            Horz = Result;
            while (Horz.Prev.Dx == ClipperLib.ClipperBase.horizontal) Horz = Horz.Prev;
            if (Horz.Prev.Top.X == Result.Next.Top.X) {
              if (!IsClockwise) Result = Horz.Prev;
            } else if (Horz.Prev.Top.X > Result.Next.Top.X) Result = Horz.Prev;
          }
          while (E != Result) {
            E.NextInLML = E.Next;
            if (E.Dx == ClipperLib.ClipperBase.horizontal && E != EStart && E.Bot.X != E.Prev.Top.X) this.ReverseHorizontal(E);
            E = E.Next;
          }
          if (E.Dx == ClipperLib.ClipperBase.horizontal && E != EStart && E.Bot.X != E.Prev.Top.X) this.ReverseHorizontal(E);
          Result = Result.Next;
        } else {
          while (Result.Top.Y == Result.Prev.Bot.Y && Result.Prev.OutIdx != ClipperLib.ClipperBase.Skip) Result = Result.Prev;
          if (Result.Dx == ClipperLib.ClipperBase.horizontal && Result.Prev.OutIdx != ClipperLib.ClipperBase.Skip) {
            Horz = Result;
            while (Horz.Next.Dx == ClipperLib.ClipperBase.horizontal) Horz = Horz.Next;
            if (Horz.Next.Top.X == Result.Prev.Top.X) {
              if (!IsClockwise) Result = Horz.Next;
            } else if (Horz.Next.Top.X > Result.Prev.Top.X) Result = Horz.Next;
          }
          while (E != Result) {
            E.NextInLML = E.Prev;
            if (E.Dx == ClipperLib.ClipperBase.horizontal && E != EStart && E.Bot.X != E.Next.Top.X) this.ReverseHorizontal(E);
            E = E.Prev;
          }
          if (E.Dx == ClipperLib.ClipperBase.horizontal && E != EStart && E.Bot.X != E.Next.Top.X) this.ReverseHorizontal(E);
          Result = Result.Prev;
        }
      }
      if (Result.OutIdx == ClipperLib.ClipperBase.Skip) {
        E = Result;
        if (IsClockwise) {
          while (E.Top.Y == E.Next.Bot.Y) E = E.Next;
          while (E != Result && E.Dx == ClipperLib.ClipperBase.horizontal) E = E.Prev;
        } else {
          while (E.Top.Y == E.Prev.Bot.Y) E = E.Prev;
          while (E != Result && E.Dx == ClipperLib.ClipperBase.horizontal) E = E.Next;
        }
        if (E == Result) {
          if (IsClockwise) Result = E.Next;
          else Result = E.Prev;
        } else {
          if (IsClockwise) E = Result.Next;
          else E = Result.Prev;
          var locMin = new ClipperLib.LocalMinima();
          locMin.Next = null;
          locMin.Y = E.Bot.Y;
          locMin.LeftBound = null;
          locMin.RightBound = E;
          locMin.RightBound.WindDelta = 0;
          Result = this.ProcessBound(locMin.RightBound, IsClockwise);
          this.InsertLocalMinima(locMin);
        }
      }
      return Result;
    };
    ClipperLib.ClipperBase.prototype.AddPath = function(pg, polyType, Closed) {
      if (!Closed && polyType == ClipperLib.PolyType.ptClip) ClipperLib.Error("AddPath: Open paths must be subject.");
      var highI = pg.length - 1;
      if (Closed) while (highI > 0 && ClipperLib.IntPoint.op_Equality(pg[highI], pg[0])) --highI;
      while (highI > 0 && ClipperLib.IntPoint.op_Equality(pg[highI], pg[highI - 1])) --highI;
      if (Closed && highI < 2 || !Closed && highI < 1) return false;
      var edges = new Array();
      for (var i = 0; i <= highI; i++) edges.push(new ClipperLib.TEdge());
      var IsFlat = true;
      edges[1].Curr.X = pg[1].X;
      edges[1].Curr.Y = pg[1].Y;
      var $1 = { Value: this.m_UseFullRange };
      this.RangeTest(pg[0], $1);
      this.m_UseFullRange = $1.Value;
      $1.Value = this.m_UseFullRange;
      this.RangeTest(pg[highI], $1);
      this.m_UseFullRange = $1.Value;
      this.InitEdge(edges[0], edges[1], edges[highI], pg[0]);
      this.InitEdge(edges[highI], edges[0], edges[highI - 1], pg[highI]);
      for (var i = highI - 1; i >= 1; --i) {
        $1.Value = this.m_UseFullRange;
        this.RangeTest(pg[i], $1);
        this.m_UseFullRange = $1.Value;
        this.InitEdge(edges[i], edges[i + 1], edges[i - 1], pg[i]);
      }
      var eStart = edges[0];
      var E = eStart, eLoopStop = eStart;
      for (;;) {
        if (ClipperLib.IntPoint.op_Equality(E.Curr, E.Next.Curr)) {
          if (E == E.Next) break;
          if (E == eStart) eStart = E.Next;
          E = this.RemoveEdge(E);
          eLoopStop = E;
          continue;
        }
        if (E.Prev == E.Next) break;
        else if (Closed && ClipperLib.ClipperBase.SlopesEqual(E.Prev.Curr, E.Curr, E.Next.Curr, this.m_UseFullRange) && (!this.PreserveCollinear || !this.Pt2IsBetweenPt1AndPt3(E.Prev.Curr, E.Curr, E.Next.Curr))) {
          if (E == eStart) eStart = E.Next;
          E = this.RemoveEdge(E);
          E = E.Prev;
          eLoopStop = E;
          continue;
        }
        E = E.Next;
        if (E == eLoopStop) break;
      }
      if (!Closed && E == E.Next || Closed && E.Prev == E.Next) return false;
      if (!Closed) {
        this.m_HasOpenPaths = true;
        eStart.Prev.OutIdx = ClipperLib.ClipperBase.Skip;
      }
      E = eStart;
      do {
        this.InitEdge2(E, polyType);
        E = E.Next;
        if (IsFlat && E.Curr.Y != eStart.Curr.Y) IsFlat = false;
      } while (E != eStart);
      if (IsFlat) {
        if (Closed) return false;
        E.Prev.OutIdx = ClipperLib.ClipperBase.Skip;
        if (E.Prev.Bot.X < E.Prev.Top.X) this.ReverseHorizontal(E.Prev);
        var locMin = new ClipperLib.LocalMinima();
        locMin.Next = null;
        locMin.Y = E.Bot.Y;
        locMin.LeftBound = null;
        locMin.RightBound = E;
        locMin.RightBound.Side = ClipperLib.EdgeSide.esRight;
        locMin.RightBound.WindDelta = 0;
        while (E.Next.OutIdx != ClipperLib.ClipperBase.Skip) {
          E.NextInLML = E.Next;
          if (E.Bot.X != E.Prev.Top.X) this.ReverseHorizontal(E);
          E = E.Next;
        }
        this.InsertLocalMinima(locMin);
        this.m_edges.push(edges);
        return true;
      }
      this.m_edges.push(edges);
      var clockwise;
      var EMin = null;
      for (;;) {
        E = this.FindNextLocMin(E);
        if (E == EMin) break;
        else if (EMin == null) EMin = E;
        var locMin = new ClipperLib.LocalMinima();
        locMin.Next = null;
        locMin.Y = E.Bot.Y;
        if (E.Dx < E.Prev.Dx) {
          locMin.LeftBound = E.Prev;
          locMin.RightBound = E;
          clockwise = false;
        } else {
          locMin.LeftBound = E;
          locMin.RightBound = E.Prev;
          clockwise = true;
        }
        locMin.LeftBound.Side = ClipperLib.EdgeSide.esLeft;
        locMin.RightBound.Side = ClipperLib.EdgeSide.esRight;
        if (!Closed) locMin.LeftBound.WindDelta = 0;
        else if (locMin.LeftBound.Next == locMin.RightBound) locMin.LeftBound.WindDelta = -1;
        else locMin.LeftBound.WindDelta = 1;
        locMin.RightBound.WindDelta = -locMin.LeftBound.WindDelta;
        E = this.ProcessBound(locMin.LeftBound, clockwise);
        var E2 = this.ProcessBound(locMin.RightBound, !clockwise);
        if (locMin.LeftBound.OutIdx == ClipperLib.ClipperBase.Skip) locMin.LeftBound = null;
        else if (locMin.RightBound.OutIdx == ClipperLib.ClipperBase.Skip) locMin.RightBound = null;
        this.InsertLocalMinima(locMin);
        if (!clockwise) E = E2;
      }
      return true;
    };
    ClipperLib.ClipperBase.prototype.AddPaths = function(ppg, polyType, closed) {
      var result = false;
      for (var i = 0, ilen = ppg.length; i < ilen; ++i) if (this.AddPath(ppg[i], polyType, closed)) result = true;
      return result;
    };
    ClipperLib.ClipperBase.prototype.Pt2IsBetweenPt1AndPt3 = function(pt1, pt2, pt3) {
      if (ClipperLib.IntPoint.op_Equality(pt1, pt3) || ClipperLib.IntPoint.op_Equality(pt1, pt2) || ClipperLib.IntPoint.op_Equality(pt3, pt2)) return false;
      else if (pt1.X != pt3.X) return pt2.X > pt1.X == pt2.X < pt3.X;
      else return pt2.Y > pt1.Y == pt2.Y < pt3.Y;
    };
    ClipperLib.ClipperBase.prototype.RemoveEdge = function(e) {
      e.Prev.Next = e.Next;
      e.Next.Prev = e.Prev;
      var result = e.Next;
      e.Prev = null;
      return result;
    };
    ClipperLib.ClipperBase.prototype.SetDx = function(e) {
      e.Delta.X = e.Top.X - e.Bot.X;
      e.Delta.Y = e.Top.Y - e.Bot.Y;
      if (e.Delta.Y === 0) e.Dx = ClipperLib.ClipperBase.horizontal;
      else e.Dx = e.Delta.X / e.Delta.Y;
    };
    ClipperLib.ClipperBase.prototype.InsertLocalMinima = function(newLm) {
      if (this.m_MinimaList === null) this.m_MinimaList = newLm;
      else if (newLm.Y >= this.m_MinimaList.Y) {
        newLm.Next = this.m_MinimaList;
        this.m_MinimaList = newLm;
      } else {
        var tmpLm = this.m_MinimaList;
        while (tmpLm.Next !== null && newLm.Y < tmpLm.Next.Y) tmpLm = tmpLm.Next;
        newLm.Next = tmpLm.Next;
        tmpLm.Next = newLm;
      }
    };
    ClipperLib.ClipperBase.prototype.PopLocalMinima = function() {
      if (this.m_CurrentLM === null) return;
      this.m_CurrentLM = this.m_CurrentLM.Next;
    };
    ClipperLib.ClipperBase.prototype.ReverseHorizontal = function(e) {
      var tmp = e.Top.X;
      e.Top.X = e.Bot.X;
      e.Bot.X = tmp;
      if (use_xyz) {
        tmp = e.Top.Z;
        e.Top.Z = e.Bot.Z;
        e.Bot.Z = tmp;
      }
    };
    ClipperLib.ClipperBase.prototype.Reset = function() {
      this.m_CurrentLM = this.m_MinimaList;
      if (this.m_CurrentLM == null) return;
      var lm = this.m_MinimaList;
      while (lm != null) {
        var e = lm.LeftBound;
        if (e != null) {
          e.Curr.X = e.Bot.X;
          e.Curr.Y = e.Bot.Y;
          e.Side = ClipperLib.EdgeSide.esLeft;
          e.OutIdx = ClipperLib.ClipperBase.Unassigned;
        }
        e = lm.RightBound;
        if (e != null) {
          e.Curr.X = e.Bot.X;
          e.Curr.Y = e.Bot.Y;
          e.Side = ClipperLib.EdgeSide.esRight;
          e.OutIdx = ClipperLib.ClipperBase.Unassigned;
        }
        lm = lm.Next;
      }
    };
    ClipperLib.Clipper = function(InitOptions) {
      if (typeof InitOptions == "undefined") InitOptions = 0;
      this.m_PolyOuts = null;
      this.m_ClipType = ClipperLib.ClipType.ctIntersection;
      this.m_Scanbeam = null;
      this.m_ActiveEdges = null;
      this.m_SortedEdges = null;
      this.m_IntersectList = null;
      this.m_IntersectNodeComparer = null;
      this.m_ExecuteLocked = false;
      this.m_ClipFillType = ClipperLib.PolyFillType.pftEvenOdd;
      this.m_SubjFillType = ClipperLib.PolyFillType.pftEvenOdd;
      this.m_Joins = null;
      this.m_GhostJoins = null;
      this.m_UsingPolyTree = false;
      this.ReverseSolution = false;
      this.StrictlySimple = false;
      ClipperLib.ClipperBase.call(this);
      this.m_Scanbeam = null;
      this.m_ActiveEdges = null;
      this.m_SortedEdges = null;
      this.m_IntersectList = new Array();
      this.m_IntersectNodeComparer = ClipperLib.MyIntersectNodeSort.Compare;
      this.m_ExecuteLocked = false;
      this.m_UsingPolyTree = false;
      this.m_PolyOuts = new Array();
      this.m_Joins = new Array();
      this.m_GhostJoins = new Array();
      this.ReverseSolution = (1 & InitOptions) !== 0;
      this.StrictlySimple = (2 & InitOptions) !== 0;
      this.PreserveCollinear = (4 & InitOptions) !== 0;
      if (use_xyz) this.ZFillFunction = null;
    };
    ClipperLib.Clipper.ioReverseSolution = 1;
    ClipperLib.Clipper.ioStrictlySimple = 2;
    ClipperLib.Clipper.ioPreserveCollinear = 4;
    ClipperLib.Clipper.prototype.Clear = function() {
      if (this.m_edges.length === 0) return;
      this.DisposeAllPolyPts();
      ClipperLib.ClipperBase.prototype.Clear.call(this);
    };
    ClipperLib.Clipper.prototype.DisposeScanbeamList = function() {
      while (this.m_Scanbeam !== null) {
        var sb2 = this.m_Scanbeam.Next;
        this.m_Scanbeam = null;
        this.m_Scanbeam = sb2;
      }
    };
    ClipperLib.Clipper.prototype.Reset = function() {
      ClipperLib.ClipperBase.prototype.Reset.call(this);
      this.m_Scanbeam = null;
      this.m_ActiveEdges = null;
      this.m_SortedEdges = null;
      var lm = this.m_MinimaList;
      while (lm !== null) {
        this.InsertScanbeam(lm.Y);
        lm = lm.Next;
      }
    };
    ClipperLib.Clipper.prototype.InsertScanbeam = function(Y) {
      if (this.m_Scanbeam === null) {
        this.m_Scanbeam = new ClipperLib.Scanbeam();
        this.m_Scanbeam.Next = null;
        this.m_Scanbeam.Y = Y;
      } else if (Y > this.m_Scanbeam.Y) {
        var newSb = new ClipperLib.Scanbeam();
        newSb.Y = Y;
        newSb.Next = this.m_Scanbeam;
        this.m_Scanbeam = newSb;
      } else {
        var sb2 = this.m_Scanbeam;
        while (sb2.Next !== null && Y <= sb2.Next.Y) sb2 = sb2.Next;
        if (Y == sb2.Y) return;
        var newSb = new ClipperLib.Scanbeam();
        newSb.Y = Y;
        newSb.Next = sb2.Next;
        sb2.Next = newSb;
      }
    };
    ClipperLib.Clipper.prototype.Execute = function() {
      var a = arguments, alen = a.length, ispolytree = a[1] instanceof ClipperLib.PolyTree;
      if (alen == 4 && !ispolytree) {
        var clipType = a[0], solution = a[1], subjFillType = a[2], clipFillType = a[3];
        if (this.m_ExecuteLocked) return false;
        if (this.m_HasOpenPaths) ClipperLib.Error("Error: PolyTree struct is need for open path clipping.");
        this.m_ExecuteLocked = true;
        ClipperLib.Clear(solution);
        this.m_SubjFillType = subjFillType;
        this.m_ClipFillType = clipFillType;
        this.m_ClipType = clipType;
        this.m_UsingPolyTree = false;
        try {
          var succeeded = this.ExecuteInternal();
          if (succeeded) this.BuildResult(solution);
        } finally {
          this.DisposeAllPolyPts();
          this.m_ExecuteLocked = false;
        }
        return succeeded;
      } else if (alen == 4 && ispolytree) {
        var clipType = a[0], polytree = a[1], subjFillType = a[2], clipFillType = a[3];
        if (this.m_ExecuteLocked) return false;
        this.m_ExecuteLocked = true;
        this.m_SubjFillType = subjFillType;
        this.m_ClipFillType = clipFillType;
        this.m_ClipType = clipType;
        this.m_UsingPolyTree = true;
        try {
          var succeeded = this.ExecuteInternal();
          if (succeeded) this.BuildResult2(polytree);
        } finally {
          this.DisposeAllPolyPts();
          this.m_ExecuteLocked = false;
        }
        return succeeded;
      } else if (alen == 2 && !ispolytree) {
        var clipType = a[0], solution = a[1];
        return this.Execute(clipType, solution, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
      } else if (alen == 2 && ispolytree) {
        var clipType = a[0], polytree = a[1];
        return this.Execute(clipType, polytree, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
      }
    };
    ClipperLib.Clipper.prototype.FixHoleLinkage = function(outRec) {
      if (outRec.FirstLeft === null || outRec.IsHole != outRec.FirstLeft.IsHole && outRec.FirstLeft.Pts !== null) return;
      var orfl = outRec.FirstLeft;
      while (orfl !== null && (orfl.IsHole == outRec.IsHole || orfl.Pts === null)) orfl = orfl.FirstLeft;
      outRec.FirstLeft = orfl;
    };
    ClipperLib.Clipper.prototype.ExecuteInternal = function() {
      try {
        this.Reset();
        if (this.m_CurrentLM === null) return false;
        var botY = this.PopScanbeam();
        do {
          this.InsertLocalMinimaIntoAEL(botY);
          ClipperLib.Clear(this.m_GhostJoins);
          this.ProcessHorizontals(false);
          if (this.m_Scanbeam === null) break;
          var topY = this.PopScanbeam();
          if (!this.ProcessIntersections(botY, topY)) return false;
          this.ProcessEdgesAtTopOfScanbeam(topY);
          botY = topY;
        } while (this.m_Scanbeam !== null || this.m_CurrentLM !== null);
        for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
          var outRec = this.m_PolyOuts[i];
          if (outRec.Pts === null || outRec.IsOpen) continue;
          if ((outRec.IsHole ^ this.ReverseSolution) == this.Area(outRec) > 0) this.ReversePolyPtLinks(outRec.Pts);
        }
        this.JoinCommonEdges();
        for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
          var outRec = this.m_PolyOuts[i];
          if (outRec.Pts !== null && !outRec.IsOpen) this.FixupOutPolygon(outRec);
        }
        if (this.StrictlySimple) this.DoSimplePolygons();
        return true;
      } finally {
        ClipperLib.Clear(this.m_Joins);
        ClipperLib.Clear(this.m_GhostJoins);
      }
    };
    ClipperLib.Clipper.prototype.PopScanbeam = function() {
      var Y = this.m_Scanbeam.Y;
      this.m_Scanbeam;
      this.m_Scanbeam = this.m_Scanbeam.Next;
      return Y;
    };
    ClipperLib.Clipper.prototype.DisposeAllPolyPts = function() {
      for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; ++i) this.DisposeOutRec(i);
      ClipperLib.Clear(this.m_PolyOuts);
    };
    ClipperLib.Clipper.prototype.DisposeOutRec = function(index) {
      var outRec = this.m_PolyOuts[index];
      if (outRec.Pts !== null) this.DisposeOutPts(outRec.Pts);
      outRec = null;
      this.m_PolyOuts[index] = null;
    };
    ClipperLib.Clipper.prototype.DisposeOutPts = function(pp) {
      if (pp === null) return;
      pp.Prev.Next = null;
      while (pp !== null) pp = pp.Next;
    };
    ClipperLib.Clipper.prototype.AddJoin = function(Op1, Op2, OffPt) {
      var j = new ClipperLib.Join();
      j.OutPt1 = Op1;
      j.OutPt2 = Op2;
      j.OffPt.X = OffPt.X;
      j.OffPt.Y = OffPt.Y;
      this.m_Joins.push(j);
    };
    ClipperLib.Clipper.prototype.AddGhostJoin = function(Op, OffPt) {
      var j = new ClipperLib.Join();
      j.OutPt1 = Op;
      j.OffPt.X = OffPt.X;
      j.OffPt.Y = OffPt.Y;
      this.m_GhostJoins.push(j);
    };
    if (use_xyz) ClipperLib.Clipper.prototype.SetZ = function(pt, e) {
      pt.Z = 0;
      if (this.ZFillFunction !== null) {
        if (e.OutIdx < 0) this.ZFillFunction(e.Bot, e.Top, pt);
        else this.ZFillFunction(e.Top, e.Bot, pt);
      }
    };
    ClipperLib.Clipper.prototype.InsertLocalMinimaIntoAEL = function(botY) {
      while (this.m_CurrentLM !== null && this.m_CurrentLM.Y == botY) {
        var lb = this.m_CurrentLM.LeftBound;
        var rb = this.m_CurrentLM.RightBound;
        this.PopLocalMinima();
        var Op1 = null;
        if (lb === null) {
          this.InsertEdgeIntoAEL(rb, null);
          this.SetWindingCount(rb);
          if (this.IsContributing(rb)) Op1 = this.AddOutPt(rb, rb.Bot);
        } else if (rb == null) {
          this.InsertEdgeIntoAEL(lb, null);
          this.SetWindingCount(lb);
          if (this.IsContributing(lb)) Op1 = this.AddOutPt(lb, lb.Bot);
          this.InsertScanbeam(lb.Top.Y);
        } else {
          this.InsertEdgeIntoAEL(lb, null);
          this.InsertEdgeIntoAEL(rb, lb);
          this.SetWindingCount(lb);
          rb.WindCnt = lb.WindCnt;
          rb.WindCnt2 = lb.WindCnt2;
          if (this.IsContributing(lb)) Op1 = this.AddLocalMinPoly(lb, rb, lb.Bot);
          this.InsertScanbeam(lb.Top.Y);
        }
        if (rb != null) {
          if (ClipperLib.ClipperBase.IsHorizontal(rb)) this.AddEdgeToSEL(rb);
          else this.InsertScanbeam(rb.Top.Y);
        }
        if (lb == null || rb == null) continue;
        if (Op1 !== null && ClipperLib.ClipperBase.IsHorizontal(rb) && this.m_GhostJoins.length > 0 && rb.WindDelta !== 0) for (var i = 0, ilen = this.m_GhostJoins.length; i < ilen; i++) {
          var j = this.m_GhostJoins[i];
          if (this.HorzSegmentsOverlap(j.OutPt1.Pt, j.OffPt, rb.Bot, rb.Top)) this.AddJoin(j.OutPt1, Op1, j.OffPt);
        }
        if (lb.OutIdx >= 0 && lb.PrevInAEL !== null && lb.PrevInAEL.Curr.X == lb.Bot.X && lb.PrevInAEL.OutIdx >= 0 && ClipperLib.ClipperBase.SlopesEqual(lb.PrevInAEL, lb, this.m_UseFullRange) && lb.WindDelta !== 0 && lb.PrevInAEL.WindDelta !== 0) {
          var Op2 = this.AddOutPt(lb.PrevInAEL, lb.Bot);
          this.AddJoin(Op1, Op2, lb.Top);
        }
        if (lb.NextInAEL != rb) {
          if (rb.OutIdx >= 0 && rb.PrevInAEL.OutIdx >= 0 && ClipperLib.ClipperBase.SlopesEqual(rb.PrevInAEL, rb, this.m_UseFullRange) && rb.WindDelta !== 0 && rb.PrevInAEL.WindDelta !== 0) {
            var Op2 = this.AddOutPt(rb.PrevInAEL, rb.Bot);
            this.AddJoin(Op1, Op2, rb.Top);
          }
          var e = lb.NextInAEL;
          if (e !== null) while (e != rb) {
            this.IntersectEdges(rb, e, lb.Curr, false);
            e = e.NextInAEL;
          }
        }
      }
    };
    ClipperLib.Clipper.prototype.InsertEdgeIntoAEL = function(edge, startEdge) {
      if (this.m_ActiveEdges === null) {
        edge.PrevInAEL = null;
        edge.NextInAEL = null;
        this.m_ActiveEdges = edge;
      } else if (startEdge === null && this.E2InsertsBeforeE1(this.m_ActiveEdges, edge)) {
        edge.PrevInAEL = null;
        edge.NextInAEL = this.m_ActiveEdges;
        this.m_ActiveEdges.PrevInAEL = edge;
        this.m_ActiveEdges = edge;
      } else {
        if (startEdge === null) startEdge = this.m_ActiveEdges;
        while (startEdge.NextInAEL !== null && !this.E2InsertsBeforeE1(startEdge.NextInAEL, edge)) startEdge = startEdge.NextInAEL;
        edge.NextInAEL = startEdge.NextInAEL;
        if (startEdge.NextInAEL !== null) startEdge.NextInAEL.PrevInAEL = edge;
        edge.PrevInAEL = startEdge;
        startEdge.NextInAEL = edge;
      }
    };
    ClipperLib.Clipper.prototype.E2InsertsBeforeE1 = function(e1, e2) {
      if (e2.Curr.X == e1.Curr.X) {
        if (e2.Top.Y > e1.Top.Y) return e2.Top.X < ClipperLib.Clipper.TopX(e1, e2.Top.Y);
        else return e1.Top.X > ClipperLib.Clipper.TopX(e2, e1.Top.Y);
      } else return e2.Curr.X < e1.Curr.X;
    };
    ClipperLib.Clipper.prototype.IsEvenOddFillType = function(edge) {
      if (edge.PolyTyp == ClipperLib.PolyType.ptSubject) return this.m_SubjFillType == ClipperLib.PolyFillType.pftEvenOdd;
      else return this.m_ClipFillType == ClipperLib.PolyFillType.pftEvenOdd;
    };
    ClipperLib.Clipper.prototype.IsEvenOddAltFillType = function(edge) {
      if (edge.PolyTyp == ClipperLib.PolyType.ptSubject) return this.m_ClipFillType == ClipperLib.PolyFillType.pftEvenOdd;
      else return this.m_SubjFillType == ClipperLib.PolyFillType.pftEvenOdd;
    };
    ClipperLib.Clipper.prototype.IsContributing = function(edge) {
      var pft, pft2;
      if (edge.PolyTyp == ClipperLib.PolyType.ptSubject) {
        pft = this.m_SubjFillType;
        pft2 = this.m_ClipFillType;
      } else {
        pft = this.m_ClipFillType;
        pft2 = this.m_SubjFillType;
      }
      switch (pft) {
        case ClipperLib.PolyFillType.pftEvenOdd:
          if (edge.WindDelta === 0 && edge.WindCnt != 1) return false;
          break;
        case ClipperLib.PolyFillType.pftNonZero:
          if (Math.abs(edge.WindCnt) != 1) return false;
          break;
        case ClipperLib.PolyFillType.pftPositive:
          if (edge.WindCnt != 1) return false;
          break;
        default: if (edge.WindCnt != -1) return false;
      }
      switch (this.m_ClipType) {
        case ClipperLib.ClipType.ctIntersection: switch (pft2) {
          case ClipperLib.PolyFillType.pftEvenOdd:
          case ClipperLib.PolyFillType.pftNonZero: return edge.WindCnt2 !== 0;
          case ClipperLib.PolyFillType.pftPositive: return edge.WindCnt2 > 0;
          default: return edge.WindCnt2 < 0;
        }
        case ClipperLib.ClipType.ctUnion: switch (pft2) {
          case ClipperLib.PolyFillType.pftEvenOdd:
          case ClipperLib.PolyFillType.pftNonZero: return edge.WindCnt2 === 0;
          case ClipperLib.PolyFillType.pftPositive: return edge.WindCnt2 <= 0;
          default: return edge.WindCnt2 >= 0;
        }
        case ClipperLib.ClipType.ctDifference: if (edge.PolyTyp == ClipperLib.PolyType.ptSubject) switch (pft2) {
          case ClipperLib.PolyFillType.pftEvenOdd:
          case ClipperLib.PolyFillType.pftNonZero: return edge.WindCnt2 === 0;
          case ClipperLib.PolyFillType.pftPositive: return edge.WindCnt2 <= 0;
          default: return edge.WindCnt2 >= 0;
        }
        else switch (pft2) {
          case ClipperLib.PolyFillType.pftEvenOdd:
          case ClipperLib.PolyFillType.pftNonZero: return edge.WindCnt2 !== 0;
          case ClipperLib.PolyFillType.pftPositive: return edge.WindCnt2 > 0;
          default: return edge.WindCnt2 < 0;
        }
        case ClipperLib.ClipType.ctXor: if (edge.WindDelta === 0) switch (pft2) {
          case ClipperLib.PolyFillType.pftEvenOdd:
          case ClipperLib.PolyFillType.pftNonZero: return edge.WindCnt2 === 0;
          case ClipperLib.PolyFillType.pftPositive: return edge.WindCnt2 <= 0;
          default: return edge.WindCnt2 >= 0;
        }
        else return true;
      }
      return true;
    };
    ClipperLib.Clipper.prototype.SetWindingCount = function(edge) {
      var e = edge.PrevInAEL;
      while (e !== null && (e.PolyTyp != edge.PolyTyp || e.WindDelta === 0)) e = e.PrevInAEL;
      if (e === null) {
        edge.WindCnt = edge.WindDelta === 0 ? 1 : edge.WindDelta;
        edge.WindCnt2 = 0;
        e = this.m_ActiveEdges;
      } else if (edge.WindDelta === 0 && this.m_ClipType != ClipperLib.ClipType.ctUnion) {
        edge.WindCnt = 1;
        edge.WindCnt2 = e.WindCnt2;
        e = e.NextInAEL;
      } else if (this.IsEvenOddFillType(edge)) {
        if (edge.WindDelta === 0) {
          var Inside = true;
          var e2 = e.PrevInAEL;
          while (e2 !== null) {
            if (e2.PolyTyp == e.PolyTyp && e2.WindDelta !== 0) Inside = !Inside;
            e2 = e2.PrevInAEL;
          }
          edge.WindCnt = Inside ? 0 : 1;
        } else edge.WindCnt = edge.WindDelta;
        edge.WindCnt2 = e.WindCnt2;
        e = e.NextInAEL;
      } else {
        if (e.WindCnt * e.WindDelta < 0) {
          if (Math.abs(e.WindCnt) > 1) {
            if (e.WindDelta * edge.WindDelta < 0) edge.WindCnt = e.WindCnt;
            else edge.WindCnt = e.WindCnt + edge.WindDelta;
          } else edge.WindCnt = edge.WindDelta === 0 ? 1 : edge.WindDelta;
        } else if (edge.WindDelta === 0) edge.WindCnt = e.WindCnt < 0 ? e.WindCnt - 1 : e.WindCnt + 1;
        else if (e.WindDelta * edge.WindDelta < 0) edge.WindCnt = e.WindCnt;
        else edge.WindCnt = e.WindCnt + edge.WindDelta;
        edge.WindCnt2 = e.WindCnt2;
        e = e.NextInAEL;
      }
      if (this.IsEvenOddAltFillType(edge)) while (e != edge) {
        if (e.WindDelta !== 0) edge.WindCnt2 = edge.WindCnt2 === 0 ? 1 : 0;
        e = e.NextInAEL;
      }
      else while (e != edge) {
        edge.WindCnt2 += e.WindDelta;
        e = e.NextInAEL;
      }
    };
    ClipperLib.Clipper.prototype.AddEdgeToSEL = function(edge) {
      if (this.m_SortedEdges === null) {
        this.m_SortedEdges = edge;
        edge.PrevInSEL = null;
        edge.NextInSEL = null;
      } else {
        edge.NextInSEL = this.m_SortedEdges;
        edge.PrevInSEL = null;
        this.m_SortedEdges.PrevInSEL = edge;
        this.m_SortedEdges = edge;
      }
    };
    ClipperLib.Clipper.prototype.CopyAELToSEL = function() {
      var e = this.m_ActiveEdges;
      this.m_SortedEdges = e;
      while (e !== null) {
        e.PrevInSEL = e.PrevInAEL;
        e.NextInSEL = e.NextInAEL;
        e = e.NextInAEL;
      }
    };
    ClipperLib.Clipper.prototype.SwapPositionsInAEL = function(edge1, edge2) {
      if (edge1.NextInAEL == edge1.PrevInAEL || edge2.NextInAEL == edge2.PrevInAEL) return;
      if (edge1.NextInAEL == edge2) {
        var next = edge2.NextInAEL;
        if (next !== null) next.PrevInAEL = edge1;
        var prev = edge1.PrevInAEL;
        if (prev !== null) prev.NextInAEL = edge2;
        edge2.PrevInAEL = prev;
        edge2.NextInAEL = edge1;
        edge1.PrevInAEL = edge2;
        edge1.NextInAEL = next;
      } else if (edge2.NextInAEL == edge1) {
        var next = edge1.NextInAEL;
        if (next !== null) next.PrevInAEL = edge2;
        var prev = edge2.PrevInAEL;
        if (prev !== null) prev.NextInAEL = edge1;
        edge1.PrevInAEL = prev;
        edge1.NextInAEL = edge2;
        edge2.PrevInAEL = edge1;
        edge2.NextInAEL = next;
      } else {
        var next = edge1.NextInAEL;
        var prev = edge1.PrevInAEL;
        edge1.NextInAEL = edge2.NextInAEL;
        if (edge1.NextInAEL !== null) edge1.NextInAEL.PrevInAEL = edge1;
        edge1.PrevInAEL = edge2.PrevInAEL;
        if (edge1.PrevInAEL !== null) edge1.PrevInAEL.NextInAEL = edge1;
        edge2.NextInAEL = next;
        if (edge2.NextInAEL !== null) edge2.NextInAEL.PrevInAEL = edge2;
        edge2.PrevInAEL = prev;
        if (edge2.PrevInAEL !== null) edge2.PrevInAEL.NextInAEL = edge2;
      }
      if (edge1.PrevInAEL === null) this.m_ActiveEdges = edge1;
      else if (edge2.PrevInAEL === null) this.m_ActiveEdges = edge2;
    };
    ClipperLib.Clipper.prototype.SwapPositionsInSEL = function(edge1, edge2) {
      if (edge1.NextInSEL === null && edge1.PrevInSEL === null) return;
      if (edge2.NextInSEL === null && edge2.PrevInSEL === null) return;
      if (edge1.NextInSEL == edge2) {
        var next = edge2.NextInSEL;
        if (next !== null) next.PrevInSEL = edge1;
        var prev = edge1.PrevInSEL;
        if (prev !== null) prev.NextInSEL = edge2;
        edge2.PrevInSEL = prev;
        edge2.NextInSEL = edge1;
        edge1.PrevInSEL = edge2;
        edge1.NextInSEL = next;
      } else if (edge2.NextInSEL == edge1) {
        var next = edge1.NextInSEL;
        if (next !== null) next.PrevInSEL = edge2;
        var prev = edge2.PrevInSEL;
        if (prev !== null) prev.NextInSEL = edge1;
        edge1.PrevInSEL = prev;
        edge1.NextInSEL = edge2;
        edge2.PrevInSEL = edge1;
        edge2.NextInSEL = next;
      } else {
        var next = edge1.NextInSEL;
        var prev = edge1.PrevInSEL;
        edge1.NextInSEL = edge2.NextInSEL;
        if (edge1.NextInSEL !== null) edge1.NextInSEL.PrevInSEL = edge1;
        edge1.PrevInSEL = edge2.PrevInSEL;
        if (edge1.PrevInSEL !== null) edge1.PrevInSEL.NextInSEL = edge1;
        edge2.NextInSEL = next;
        if (edge2.NextInSEL !== null) edge2.NextInSEL.PrevInSEL = edge2;
        edge2.PrevInSEL = prev;
        if (edge2.PrevInSEL !== null) edge2.PrevInSEL.NextInSEL = edge2;
      }
      if (edge1.PrevInSEL === null) this.m_SortedEdges = edge1;
      else if (edge2.PrevInSEL === null) this.m_SortedEdges = edge2;
    };
    ClipperLib.Clipper.prototype.AddLocalMaxPoly = function(e1, e2, pt) {
      this.AddOutPt(e1, pt);
      if (e2.WindDelta == 0) this.AddOutPt(e2, pt);
      if (e1.OutIdx == e2.OutIdx) {
        e1.OutIdx = -1;
        e2.OutIdx = -1;
      } else if (e1.OutIdx < e2.OutIdx) this.AppendPolygon(e1, e2);
      else this.AppendPolygon(e2, e1);
    };
    ClipperLib.Clipper.prototype.AddLocalMinPoly = function(e1, e2, pt) {
      var result;
      var e, prevE;
      if (ClipperLib.ClipperBase.IsHorizontal(e2) || e1.Dx > e2.Dx) {
        result = this.AddOutPt(e1, pt);
        e2.OutIdx = e1.OutIdx;
        e1.Side = ClipperLib.EdgeSide.esLeft;
        e2.Side = ClipperLib.EdgeSide.esRight;
        e = e1;
        if (e.PrevInAEL == e2) prevE = e2.PrevInAEL;
        else prevE = e.PrevInAEL;
      } else {
        result = this.AddOutPt(e2, pt);
        e1.OutIdx = e2.OutIdx;
        e1.Side = ClipperLib.EdgeSide.esRight;
        e2.Side = ClipperLib.EdgeSide.esLeft;
        e = e2;
        if (e.PrevInAEL == e1) prevE = e1.PrevInAEL;
        else prevE = e.PrevInAEL;
      }
      if (prevE !== null && prevE.OutIdx >= 0 && ClipperLib.Clipper.TopX(prevE, pt.Y) == ClipperLib.Clipper.TopX(e, pt.Y) && ClipperLib.ClipperBase.SlopesEqual(e, prevE, this.m_UseFullRange) && e.WindDelta !== 0 && prevE.WindDelta !== 0) {
        var outPt = this.AddOutPt(prevE, pt);
        this.AddJoin(result, outPt, e.Top);
      }
      return result;
    };
    ClipperLib.Clipper.prototype.CreateOutRec = function() {
      var result = new ClipperLib.OutRec();
      result.Idx = -1;
      result.IsHole = false;
      result.IsOpen = false;
      result.FirstLeft = null;
      result.Pts = null;
      result.BottomPt = null;
      result.PolyNode = null;
      this.m_PolyOuts.push(result);
      result.Idx = this.m_PolyOuts.length - 1;
      return result;
    };
    ClipperLib.Clipper.prototype.AddOutPt = function(e, pt) {
      var ToFront = e.Side == ClipperLib.EdgeSide.esLeft;
      if (e.OutIdx < 0) {
        var outRec = this.CreateOutRec();
        outRec.IsOpen = e.WindDelta === 0;
        var newOp = new ClipperLib.OutPt();
        outRec.Pts = newOp;
        newOp.Idx = outRec.Idx;
        newOp.Pt.X = pt.X;
        newOp.Pt.Y = pt.Y;
        newOp.Next = newOp;
        newOp.Prev = newOp;
        if (!outRec.IsOpen) this.SetHoleState(e, outRec);
        if (use_xyz) {
          if (ClipperLib.IntPoint.op_Equality(pt, e.Bot)) {
            newOp.Pt.X = e.Bot.X;
            newOp.Pt.Y = e.Bot.Y;
            newOp.Pt.Z = e.Bot.Z;
          } else if (ClipperLib.IntPoint.op_Equality(pt, e.Top)) {
            newOp.Pt.X = e.Top.X;
            newOp.Pt.Y = e.Top.Y;
            newOp.Pt.Z = e.Top.Z;
          } else this.SetZ(newOp.Pt, e);
        }
        e.OutIdx = outRec.Idx;
        return newOp;
      } else {
        var outRec = this.m_PolyOuts[e.OutIdx];
        var op = outRec.Pts;
        if (ToFront && ClipperLib.IntPoint.op_Equality(pt, op.Pt)) return op;
        else if (!ToFront && ClipperLib.IntPoint.op_Equality(pt, op.Prev.Pt)) return op.Prev;
        var newOp = new ClipperLib.OutPt();
        newOp.Idx = outRec.Idx;
        newOp.Pt.X = pt.X;
        newOp.Pt.Y = pt.Y;
        newOp.Next = op;
        newOp.Prev = op.Prev;
        newOp.Prev.Next = newOp;
        op.Prev = newOp;
        if (ToFront) outRec.Pts = newOp;
        if (use_xyz) {
          if (ClipperLib.IntPoint.op_Equality(pt, e.Bot)) {
            newOp.Pt.X = e.Bot.X;
            newOp.Pt.Y = e.Bot.Y;
            newOp.Pt.Z = e.Bot.Z;
          } else if (ClipperLib.IntPoint.op_Equality(pt, e.Top)) {
            newOp.Pt.X = e.Top.X;
            newOp.Pt.Y = e.Top.Y;
            newOp.Pt.Z = e.Top.Z;
          } else this.SetZ(newOp.Pt, e);
        }
        return newOp;
      }
    };
    ClipperLib.Clipper.prototype.SwapPoints = function(pt1, pt2) {
      var tmp = new ClipperLib.IntPoint(pt1.Value);
      pt1.Value.X = pt2.Value.X;
      pt1.Value.Y = pt2.Value.Y;
      pt2.Value.X = tmp.X;
      pt2.Value.Y = tmp.Y;
    };
    ClipperLib.Clipper.prototype.HorzSegmentsOverlap = function(Pt1a, Pt1b, Pt2a, Pt2b) {
      if (Pt1a.X > Pt2a.X == Pt1a.X < Pt2b.X) return true;
      else if (Pt1b.X > Pt2a.X == Pt1b.X < Pt2b.X) return true;
      else if (Pt2a.X > Pt1a.X == Pt2a.X < Pt1b.X) return true;
      else if (Pt2b.X > Pt1a.X == Pt2b.X < Pt1b.X) return true;
      else if (Pt1a.X == Pt2a.X && Pt1b.X == Pt2b.X) return true;
      else if (Pt1a.X == Pt2b.X && Pt1b.X == Pt2a.X) return true;
      else return false;
    };
    ClipperLib.Clipper.prototype.InsertPolyPtBetween = function(p1, p2, pt) {
      var result = new ClipperLib.OutPt();
      result.Pt.X = pt.X;
      result.Pt.Y = pt.Y;
      if (p2 == p1.Next) {
        p1.Next = result;
        p2.Prev = result;
        result.Next = p2;
        result.Prev = p1;
      } else {
        p2.Next = result;
        p1.Prev = result;
        result.Next = p1;
        result.Prev = p2;
      }
      return result;
    };
    ClipperLib.Clipper.prototype.SetHoleState = function(e, outRec) {
      var isHole = false;
      var e2 = e.PrevInAEL;
      while (e2 !== null) {
        if (e2.OutIdx >= 0 && e2.WindDelta != 0) {
          isHole = !isHole;
          if (outRec.FirstLeft === null) outRec.FirstLeft = this.m_PolyOuts[e2.OutIdx];
        }
        e2 = e2.PrevInAEL;
      }
      if (isHole) outRec.IsHole = true;
    };
    ClipperLib.Clipper.prototype.GetDx = function(pt1, pt2) {
      if (pt1.Y == pt2.Y) return ClipperLib.ClipperBase.horizontal;
      else return (pt2.X - pt1.X) / (pt2.Y - pt1.Y);
    };
    ClipperLib.Clipper.prototype.FirstIsBottomPt = function(btmPt1, btmPt2) {
      var p = btmPt1.Prev;
      while (ClipperLib.IntPoint.op_Equality(p.Pt, btmPt1.Pt) && p != btmPt1) p = p.Prev;
      var dx1p = Math.abs(this.GetDx(btmPt1.Pt, p.Pt));
      p = btmPt1.Next;
      while (ClipperLib.IntPoint.op_Equality(p.Pt, btmPt1.Pt) && p != btmPt1) p = p.Next;
      var dx1n = Math.abs(this.GetDx(btmPt1.Pt, p.Pt));
      p = btmPt2.Prev;
      while (ClipperLib.IntPoint.op_Equality(p.Pt, btmPt2.Pt) && p != btmPt2) p = p.Prev;
      var dx2p = Math.abs(this.GetDx(btmPt2.Pt, p.Pt));
      p = btmPt2.Next;
      while (ClipperLib.IntPoint.op_Equality(p.Pt, btmPt2.Pt) && p != btmPt2) p = p.Next;
      var dx2n = Math.abs(this.GetDx(btmPt2.Pt, p.Pt));
      return dx1p >= dx2p && dx1p >= dx2n || dx1n >= dx2p && dx1n >= dx2n;
    };
    ClipperLib.Clipper.prototype.GetBottomPt = function(pp) {
      var dups = null;
      var p = pp.Next;
      while (p != pp) {
        if (p.Pt.Y > pp.Pt.Y) {
          pp = p;
          dups = null;
        } else if (p.Pt.Y == pp.Pt.Y && p.Pt.X <= pp.Pt.X) {
          if (p.Pt.X < pp.Pt.X) {
            dups = null;
            pp = p;
          } else if (p.Next != pp && p.Prev != pp) dups = p;
        }
        p = p.Next;
      }
      if (dups !== null) while (dups != p) {
        if (!this.FirstIsBottomPt(p, dups)) pp = dups;
        dups = dups.Next;
        while (ClipperLib.IntPoint.op_Inequality(dups.Pt, pp.Pt)) dups = dups.Next;
      }
      return pp;
    };
    ClipperLib.Clipper.prototype.GetLowermostRec = function(outRec1, outRec2) {
      if (outRec1.BottomPt === null) outRec1.BottomPt = this.GetBottomPt(outRec1.Pts);
      if (outRec2.BottomPt === null) outRec2.BottomPt = this.GetBottomPt(outRec2.Pts);
      var bPt1 = outRec1.BottomPt;
      var bPt2 = outRec2.BottomPt;
      if (bPt1.Pt.Y > bPt2.Pt.Y) return outRec1;
      else if (bPt1.Pt.Y < bPt2.Pt.Y) return outRec2;
      else if (bPt1.Pt.X < bPt2.Pt.X) return outRec1;
      else if (bPt1.Pt.X > bPt2.Pt.X) return outRec2;
      else if (bPt1.Next == bPt1) return outRec2;
      else if (bPt2.Next == bPt2) return outRec1;
      else if (this.FirstIsBottomPt(bPt1, bPt2)) return outRec1;
      else return outRec2;
    };
    ClipperLib.Clipper.prototype.Param1RightOfParam2 = function(outRec1, outRec2) {
      do {
        outRec1 = outRec1.FirstLeft;
        if (outRec1 == outRec2) return true;
      } while (outRec1 !== null);
      return false;
    };
    ClipperLib.Clipper.prototype.GetOutRec = function(idx) {
      var outrec = this.m_PolyOuts[idx];
      while (outrec != this.m_PolyOuts[outrec.Idx]) outrec = this.m_PolyOuts[outrec.Idx];
      return outrec;
    };
    ClipperLib.Clipper.prototype.AppendPolygon = function(e1, e2) {
      var outRec1 = this.m_PolyOuts[e1.OutIdx];
      var outRec2 = this.m_PolyOuts[e2.OutIdx];
      var holeStateRec;
      if (this.Param1RightOfParam2(outRec1, outRec2)) holeStateRec = outRec2;
      else if (this.Param1RightOfParam2(outRec2, outRec1)) holeStateRec = outRec1;
      else holeStateRec = this.GetLowermostRec(outRec1, outRec2);
      var p1_lft = outRec1.Pts;
      var p1_rt = p1_lft.Prev;
      var p2_lft = outRec2.Pts;
      var p2_rt = p2_lft.Prev;
      var side;
      if (e1.Side == ClipperLib.EdgeSide.esLeft) {
        if (e2.Side == ClipperLib.EdgeSide.esLeft) {
          this.ReversePolyPtLinks(p2_lft);
          p2_lft.Next = p1_lft;
          p1_lft.Prev = p2_lft;
          p1_rt.Next = p2_rt;
          p2_rt.Prev = p1_rt;
          outRec1.Pts = p2_rt;
        } else {
          p2_rt.Next = p1_lft;
          p1_lft.Prev = p2_rt;
          p2_lft.Prev = p1_rt;
          p1_rt.Next = p2_lft;
          outRec1.Pts = p2_lft;
        }
        side = ClipperLib.EdgeSide.esLeft;
      } else {
        if (e2.Side == ClipperLib.EdgeSide.esRight) {
          this.ReversePolyPtLinks(p2_lft);
          p1_rt.Next = p2_rt;
          p2_rt.Prev = p1_rt;
          p2_lft.Next = p1_lft;
          p1_lft.Prev = p2_lft;
        } else {
          p1_rt.Next = p2_lft;
          p2_lft.Prev = p1_rt;
          p1_lft.Prev = p2_rt;
          p2_rt.Next = p1_lft;
        }
        side = ClipperLib.EdgeSide.esRight;
      }
      outRec1.BottomPt = null;
      if (holeStateRec == outRec2) {
        if (outRec2.FirstLeft != outRec1) outRec1.FirstLeft = outRec2.FirstLeft;
        outRec1.IsHole = outRec2.IsHole;
      }
      outRec2.Pts = null;
      outRec2.BottomPt = null;
      outRec2.FirstLeft = outRec1;
      var OKIdx = e1.OutIdx;
      var ObsoleteIdx = e2.OutIdx;
      e1.OutIdx = -1;
      e2.OutIdx = -1;
      var e = this.m_ActiveEdges;
      while (e !== null) {
        if (e.OutIdx == ObsoleteIdx) {
          e.OutIdx = OKIdx;
          e.Side = side;
          break;
        }
        e = e.NextInAEL;
      }
      outRec2.Idx = outRec1.Idx;
    };
    ClipperLib.Clipper.prototype.ReversePolyPtLinks = function(pp) {
      if (pp === null) return;
      var pp1;
      var pp2;
      pp1 = pp;
      do {
        pp2 = pp1.Next;
        pp1.Next = pp1.Prev;
        pp1.Prev = pp2;
        pp1 = pp2;
      } while (pp1 != pp);
    };
    ClipperLib.Clipper.SwapSides = function(edge1, edge2) {
      var side = edge1.Side;
      edge1.Side = edge2.Side;
      edge2.Side = side;
    };
    ClipperLib.Clipper.SwapPolyIndexes = function(edge1, edge2) {
      var outIdx = edge1.OutIdx;
      edge1.OutIdx = edge2.OutIdx;
      edge2.OutIdx = outIdx;
    };
    ClipperLib.Clipper.prototype.IntersectEdges = function(e1, e2, pt, protect) {
      var e1stops = !protect && e1.NextInLML === null && e1.Top.X == pt.X && e1.Top.Y == pt.Y;
      var e2stops = !protect && e2.NextInLML === null && e2.Top.X == pt.X && e2.Top.Y == pt.Y;
      var e1Contributing = e1.OutIdx >= 0;
      var e2Contributing = e2.OutIdx >= 0;
      if (e1.WindDelta === 0 || e2.WindDelta === 0) {
        if (e1.WindDelta === 0 && e2.WindDelta === 0) {
          if ((e1stops || e2stops) && e1Contributing && e2Contributing) this.AddLocalMaxPoly(e1, e2, pt);
        } else if (e1.PolyTyp == e2.PolyTyp && e1.WindDelta != e2.WindDelta && this.m_ClipType == ClipperLib.ClipType.ctUnion) {
          if (e1.WindDelta === 0) {
            if (e2Contributing) {
              this.AddOutPt(e1, pt);
              if (e1Contributing) e1.OutIdx = -1;
            }
          } else if (e1Contributing) {
            this.AddOutPt(e2, pt);
            if (e2Contributing) e2.OutIdx = -1;
          }
        } else if (e1.PolyTyp != e2.PolyTyp) {
          if (e1.WindDelta === 0 && Math.abs(e2.WindCnt) == 1 && (this.m_ClipType != ClipperLib.ClipType.ctUnion || e2.WindCnt2 === 0)) {
            this.AddOutPt(e1, pt);
            if (e1Contributing) e1.OutIdx = -1;
          } else if (e2.WindDelta === 0 && Math.abs(e1.WindCnt) == 1 && (this.m_ClipType != ClipperLib.ClipType.ctUnion || e1.WindCnt2 === 0)) {
            this.AddOutPt(e2, pt);
            if (e2Contributing) e2.OutIdx = -1;
          }
        }
        if (e1stops) if (e1.OutIdx < 0) this.DeleteFromAEL(e1);
        else ClipperLib.Error("Error intersecting polylines");
        if (e2stops) if (e2.OutIdx < 0) this.DeleteFromAEL(e2);
        else ClipperLib.Error("Error intersecting polylines");
        return;
      }
      if (e1.PolyTyp == e2.PolyTyp) {
        if (this.IsEvenOddFillType(e1)) {
          var oldE1WindCnt = e1.WindCnt;
          e1.WindCnt = e2.WindCnt;
          e2.WindCnt = oldE1WindCnt;
        } else {
          if (e1.WindCnt + e2.WindDelta === 0) e1.WindCnt = -e1.WindCnt;
          else e1.WindCnt += e2.WindDelta;
          if (e2.WindCnt - e1.WindDelta === 0) e2.WindCnt = -e2.WindCnt;
          else e2.WindCnt -= e1.WindDelta;
        }
      } else {
        if (!this.IsEvenOddFillType(e2)) e1.WindCnt2 += e2.WindDelta;
        else e1.WindCnt2 = e1.WindCnt2 === 0 ? 1 : 0;
        if (!this.IsEvenOddFillType(e1)) e2.WindCnt2 -= e1.WindDelta;
        else e2.WindCnt2 = e2.WindCnt2 === 0 ? 1 : 0;
      }
      var e1FillType, e2FillType, e1FillType2, e2FillType2;
      if (e1.PolyTyp == ClipperLib.PolyType.ptSubject) {
        e1FillType = this.m_SubjFillType;
        e1FillType2 = this.m_ClipFillType;
      } else {
        e1FillType = this.m_ClipFillType;
        e1FillType2 = this.m_SubjFillType;
      }
      if (e2.PolyTyp == ClipperLib.PolyType.ptSubject) {
        e2FillType = this.m_SubjFillType;
        e2FillType2 = this.m_ClipFillType;
      } else {
        e2FillType = this.m_ClipFillType;
        e2FillType2 = this.m_SubjFillType;
      }
      var e1Wc, e2Wc;
      switch (e1FillType) {
        case ClipperLib.PolyFillType.pftPositive:
          e1Wc = e1.WindCnt;
          break;
        case ClipperLib.PolyFillType.pftNegative:
          e1Wc = -e1.WindCnt;
          break;
        default: e1Wc = Math.abs(e1.WindCnt);
      }
      switch (e2FillType) {
        case ClipperLib.PolyFillType.pftPositive:
          e2Wc = e2.WindCnt;
          break;
        case ClipperLib.PolyFillType.pftNegative:
          e2Wc = -e2.WindCnt;
          break;
        default: e2Wc = Math.abs(e2.WindCnt);
      }
      if (e1Contributing && e2Contributing) {
        if (e1stops || e2stops || e1Wc !== 0 && e1Wc != 1 || e2Wc !== 0 && e2Wc != 1 || e1.PolyTyp != e2.PolyTyp && this.m_ClipType != ClipperLib.ClipType.ctXor) this.AddLocalMaxPoly(e1, e2, pt);
        else {
          this.AddOutPt(e1, pt);
          this.AddOutPt(e2, pt);
          ClipperLib.Clipper.SwapSides(e1, e2);
          ClipperLib.Clipper.SwapPolyIndexes(e1, e2);
        }
      } else if (e1Contributing) {
        if (e2Wc === 0 || e2Wc == 1) {
          this.AddOutPt(e1, pt);
          ClipperLib.Clipper.SwapSides(e1, e2);
          ClipperLib.Clipper.SwapPolyIndexes(e1, e2);
        }
      } else if (e2Contributing) {
        if (e1Wc === 0 || e1Wc == 1) {
          this.AddOutPt(e2, pt);
          ClipperLib.Clipper.SwapSides(e1, e2);
          ClipperLib.Clipper.SwapPolyIndexes(e1, e2);
        }
      } else if ((e1Wc === 0 || e1Wc == 1) && (e2Wc === 0 || e2Wc == 1) && !e1stops && !e2stops) {
        var e1Wc2, e2Wc2;
        switch (e1FillType2) {
          case ClipperLib.PolyFillType.pftPositive:
            e1Wc2 = e1.WindCnt2;
            break;
          case ClipperLib.PolyFillType.pftNegative:
            e1Wc2 = -e1.WindCnt2;
            break;
          default: e1Wc2 = Math.abs(e1.WindCnt2);
        }
        switch (e2FillType2) {
          case ClipperLib.PolyFillType.pftPositive:
            e2Wc2 = e2.WindCnt2;
            break;
          case ClipperLib.PolyFillType.pftNegative:
            e2Wc2 = -e2.WindCnt2;
            break;
          default: e2Wc2 = Math.abs(e2.WindCnt2);
        }
        if (e1.PolyTyp != e2.PolyTyp) this.AddLocalMinPoly(e1, e2, pt);
        else if (e1Wc == 1 && e2Wc == 1) switch (this.m_ClipType) {
          case ClipperLib.ClipType.ctIntersection:
            if (e1Wc2 > 0 && e2Wc2 > 0) this.AddLocalMinPoly(e1, e2, pt);
            break;
          case ClipperLib.ClipType.ctUnion:
            if (e1Wc2 <= 0 && e2Wc2 <= 0) this.AddLocalMinPoly(e1, e2, pt);
            break;
          case ClipperLib.ClipType.ctDifference:
            if (e1.PolyTyp == ClipperLib.PolyType.ptClip && e1Wc2 > 0 && e2Wc2 > 0 || e1.PolyTyp == ClipperLib.PolyType.ptSubject && e1Wc2 <= 0 && e2Wc2 <= 0) this.AddLocalMinPoly(e1, e2, pt);
            break;
          case ClipperLib.ClipType.ctXor:
            this.AddLocalMinPoly(e1, e2, pt);
            break;
        }
        else ClipperLib.Clipper.SwapSides(e1, e2);
      }
      if (e1stops != e2stops && (e1stops && e1.OutIdx >= 0 || e2stops && e2.OutIdx >= 0)) {
        ClipperLib.Clipper.SwapSides(e1, e2);
        ClipperLib.Clipper.SwapPolyIndexes(e1, e2);
      }
      if (e1stops) this.DeleteFromAEL(e1);
      if (e2stops) this.DeleteFromAEL(e2);
    };
    ClipperLib.Clipper.prototype.DeleteFromAEL = function(e) {
      var AelPrev = e.PrevInAEL;
      var AelNext = e.NextInAEL;
      if (AelPrev === null && AelNext === null && e != this.m_ActiveEdges) return;
      if (AelPrev !== null) AelPrev.NextInAEL = AelNext;
      else this.m_ActiveEdges = AelNext;
      if (AelNext !== null) AelNext.PrevInAEL = AelPrev;
      e.NextInAEL = null;
      e.PrevInAEL = null;
    };
    ClipperLib.Clipper.prototype.DeleteFromSEL = function(e) {
      var SelPrev = e.PrevInSEL;
      var SelNext = e.NextInSEL;
      if (SelPrev === null && SelNext === null && e != this.m_SortedEdges) return;
      if (SelPrev !== null) SelPrev.NextInSEL = SelNext;
      else this.m_SortedEdges = SelNext;
      if (SelNext !== null) SelNext.PrevInSEL = SelPrev;
      e.NextInSEL = null;
      e.PrevInSEL = null;
    };
    ClipperLib.Clipper.prototype.UpdateEdgeIntoAEL = function(e) {
      if (e.NextInLML === null) ClipperLib.Error("UpdateEdgeIntoAEL: invalid call");
      var AelPrev = e.PrevInAEL;
      var AelNext = e.NextInAEL;
      e.NextInLML.OutIdx = e.OutIdx;
      if (AelPrev !== null) AelPrev.NextInAEL = e.NextInLML;
      else this.m_ActiveEdges = e.NextInLML;
      if (AelNext !== null) AelNext.PrevInAEL = e.NextInLML;
      e.NextInLML.Side = e.Side;
      e.NextInLML.WindDelta = e.WindDelta;
      e.NextInLML.WindCnt = e.WindCnt;
      e.NextInLML.WindCnt2 = e.WindCnt2;
      e = e.NextInLML;
      e.Curr.X = e.Bot.X;
      e.Curr.Y = e.Bot.Y;
      e.PrevInAEL = AelPrev;
      e.NextInAEL = AelNext;
      if (!ClipperLib.ClipperBase.IsHorizontal(e)) this.InsertScanbeam(e.Top.Y);
      return e;
    };
    ClipperLib.Clipper.prototype.ProcessHorizontals = function(isTopOfScanbeam) {
      var horzEdge = this.m_SortedEdges;
      while (horzEdge !== null) {
        this.DeleteFromSEL(horzEdge);
        this.ProcessHorizontal(horzEdge, isTopOfScanbeam);
        horzEdge = this.m_SortedEdges;
      }
    };
    ClipperLib.Clipper.prototype.GetHorzDirection = function(HorzEdge, $var) {
      if (HorzEdge.Bot.X < HorzEdge.Top.X) {
        $var.Left = HorzEdge.Bot.X;
        $var.Right = HorzEdge.Top.X;
        $var.Dir = ClipperLib.Direction.dLeftToRight;
      } else {
        $var.Left = HorzEdge.Top.X;
        $var.Right = HorzEdge.Bot.X;
        $var.Dir = ClipperLib.Direction.dRightToLeft;
      }
    };
    ClipperLib.Clipper.prototype.PrepareHorzJoins = function(horzEdge, isTopOfScanbeam) {
      var outPt = this.m_PolyOuts[horzEdge.OutIdx].Pts;
      if (horzEdge.Side != ClipperLib.EdgeSide.esLeft) outPt = outPt.Prev;
      if (isTopOfScanbeam) if (ClipperLib.IntPoint.op_Equality(outPt.Pt, horzEdge.Top)) this.AddGhostJoin(outPt, horzEdge.Bot);
      else this.AddGhostJoin(outPt, horzEdge.Top);
    };
    ClipperLib.Clipper.prototype.ProcessHorizontal = function(horzEdge, isTopOfScanbeam) {
      var $var = {
        Dir: null,
        Left: null,
        Right: null
      };
      this.GetHorzDirection(horzEdge, $var);
      var dir = $var.Dir;
      var horzLeft = $var.Left;
      var horzRight = $var.Right;
      var eLastHorz = horzEdge, eMaxPair = null;
      while (eLastHorz.NextInLML !== null && ClipperLib.ClipperBase.IsHorizontal(eLastHorz.NextInLML)) eLastHorz = eLastHorz.NextInLML;
      if (eLastHorz.NextInLML === null) eMaxPair = this.GetMaximaPair(eLastHorz);
      for (;;) {
        var IsLastHorz = horzEdge == eLastHorz;
        var e = this.GetNextInAEL(horzEdge, dir);
        while (e !== null) {
          if (e.Curr.X == horzEdge.Top.X && horzEdge.NextInLML !== null && e.Dx < horzEdge.NextInLML.Dx) break;
          var eNext = this.GetNextInAEL(e, dir);
          if (dir == ClipperLib.Direction.dLeftToRight && e.Curr.X <= horzRight || dir == ClipperLib.Direction.dRightToLeft && e.Curr.X >= horzLeft) {
            if (horzEdge.OutIdx >= 0 && horzEdge.WindDelta != 0) this.PrepareHorzJoins(horzEdge, isTopOfScanbeam);
            if (e == eMaxPair && IsLastHorz) {
              if (dir == ClipperLib.Direction.dLeftToRight) this.IntersectEdges(horzEdge, e, e.Top, false);
              else this.IntersectEdges(e, horzEdge, e.Top, false);
              if (eMaxPair.OutIdx >= 0) ClipperLib.Error("ProcessHorizontal error");
              return;
            } else if (dir == ClipperLib.Direction.dLeftToRight) {
              var Pt = new ClipperLib.IntPoint(e.Curr.X, horzEdge.Curr.Y);
              this.IntersectEdges(horzEdge, e, Pt, true);
            } else {
              var Pt = new ClipperLib.IntPoint(e.Curr.X, horzEdge.Curr.Y);
              this.IntersectEdges(e, horzEdge, Pt, true);
            }
            this.SwapPositionsInAEL(horzEdge, e);
          } else if (dir == ClipperLib.Direction.dLeftToRight && e.Curr.X >= horzRight || dir == ClipperLib.Direction.dRightToLeft && e.Curr.X <= horzLeft) break;
          e = eNext;
        }
        if (horzEdge.OutIdx >= 0 && horzEdge.WindDelta !== 0) this.PrepareHorzJoins(horzEdge, isTopOfScanbeam);
        if (horzEdge.NextInLML !== null && ClipperLib.ClipperBase.IsHorizontal(horzEdge.NextInLML)) {
          horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
          if (horzEdge.OutIdx >= 0) this.AddOutPt(horzEdge, horzEdge.Bot);
          var $var = {
            Dir: dir,
            Left: horzLeft,
            Right: horzRight
          };
          this.GetHorzDirection(horzEdge, $var);
          dir = $var.Dir;
          horzLeft = $var.Left;
          horzRight = $var.Right;
        } else break;
      }
      if (horzEdge.NextInLML !== null) {
        if (horzEdge.OutIdx >= 0) {
          var op1 = this.AddOutPt(horzEdge, horzEdge.Top);
          horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
          if (horzEdge.WindDelta === 0) return;
          var ePrev = horzEdge.PrevInAEL;
          var eNext = horzEdge.NextInAEL;
          if (ePrev !== null && ePrev.Curr.X == horzEdge.Bot.X && ePrev.Curr.Y == horzEdge.Bot.Y && ePrev.WindDelta !== 0 && ePrev.OutIdx >= 0 && ePrev.Curr.Y > ePrev.Top.Y && ClipperLib.ClipperBase.SlopesEqual(horzEdge, ePrev, this.m_UseFullRange)) {
            var op2 = this.AddOutPt(ePrev, horzEdge.Bot);
            this.AddJoin(op1, op2, horzEdge.Top);
          } else if (eNext !== null && eNext.Curr.X == horzEdge.Bot.X && eNext.Curr.Y == horzEdge.Bot.Y && eNext.WindDelta !== 0 && eNext.OutIdx >= 0 && eNext.Curr.Y > eNext.Top.Y && ClipperLib.ClipperBase.SlopesEqual(horzEdge, eNext, this.m_UseFullRange)) {
            var op2 = this.AddOutPt(eNext, horzEdge.Bot);
            this.AddJoin(op1, op2, horzEdge.Top);
          }
        } else horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
      } else if (eMaxPair !== null) {
        if (eMaxPair.OutIdx >= 0) {
          if (dir == ClipperLib.Direction.dLeftToRight) this.IntersectEdges(horzEdge, eMaxPair, horzEdge.Top, false);
          else this.IntersectEdges(eMaxPair, horzEdge, horzEdge.Top, false);
          if (eMaxPair.OutIdx >= 0) ClipperLib.Error("ProcessHorizontal error");
        } else {
          this.DeleteFromAEL(horzEdge);
          this.DeleteFromAEL(eMaxPair);
        }
      } else {
        if (horzEdge.OutIdx >= 0) this.AddOutPt(horzEdge, horzEdge.Top);
        this.DeleteFromAEL(horzEdge);
      }
    };
    ClipperLib.Clipper.prototype.GetNextInAEL = function(e, Direction) {
      return Direction == ClipperLib.Direction.dLeftToRight ? e.NextInAEL : e.PrevInAEL;
    };
    ClipperLib.Clipper.prototype.IsMinima = function(e) {
      return e !== null && e.Prev.NextInLML != e && e.Next.NextInLML != e;
    };
    ClipperLib.Clipper.prototype.IsMaxima = function(e, Y) {
      return e !== null && e.Top.Y == Y && e.NextInLML === null;
    };
    ClipperLib.Clipper.prototype.IsIntermediate = function(e, Y) {
      return e.Top.Y == Y && e.NextInLML !== null;
    };
    ClipperLib.Clipper.prototype.GetMaximaPair = function(e) {
      var result = null;
      if (ClipperLib.IntPoint.op_Equality(e.Next.Top, e.Top) && e.Next.NextInLML === null) result = e.Next;
      else if (ClipperLib.IntPoint.op_Equality(e.Prev.Top, e.Top) && e.Prev.NextInLML === null) result = e.Prev;
      if (result !== null && (result.OutIdx == -2 || result.NextInAEL == result.PrevInAEL && !ClipperLib.ClipperBase.IsHorizontal(result))) return null;
      return result;
    };
    ClipperLib.Clipper.prototype.ProcessIntersections = function(botY, topY) {
      if (this.m_ActiveEdges == null) return true;
      try {
        this.BuildIntersectList(botY, topY);
        if (this.m_IntersectList.length == 0) return true;
        if (this.m_IntersectList.length == 1 || this.FixupIntersectionOrder()) this.ProcessIntersectList();
        else return false;
      } catch ($$e2) {
        this.m_SortedEdges = null;
        this.m_IntersectList.length = 0;
        ClipperLib.Error("ProcessIntersections error");
      }
      this.m_SortedEdges = null;
      return true;
    };
    ClipperLib.Clipper.prototype.BuildIntersectList = function(botY, topY) {
      if (this.m_ActiveEdges === null) return;
      var e = this.m_ActiveEdges;
      this.m_SortedEdges = e;
      while (e !== null) {
        e.PrevInSEL = e.PrevInAEL;
        e.NextInSEL = e.NextInAEL;
        e.Curr.X = ClipperLib.Clipper.TopX(e, topY);
        e = e.NextInAEL;
      }
      var isModified = true;
      while (isModified && this.m_SortedEdges !== null) {
        isModified = false;
        e = this.m_SortedEdges;
        while (e.NextInSEL !== null) {
          var eNext = e.NextInSEL;
          var pt = new ClipperLib.IntPoint();
          if (e.Curr.X > eNext.Curr.X) {
            if (!this.IntersectPoint(e, eNext, pt) && e.Curr.X > eNext.Curr.X + 1) ClipperLib.Error("Intersection error");
            if (pt.Y > botY) {
              pt.Y = botY;
              if (Math.abs(e.Dx) > Math.abs(eNext.Dx)) pt.X = ClipperLib.Clipper.TopX(eNext, botY);
              else pt.X = ClipperLib.Clipper.TopX(e, botY);
            }
            var newNode = new ClipperLib.IntersectNode();
            newNode.Edge1 = e;
            newNode.Edge2 = eNext;
            newNode.Pt.X = pt.X;
            newNode.Pt.Y = pt.Y;
            this.m_IntersectList.push(newNode);
            this.SwapPositionsInSEL(e, eNext);
            isModified = true;
          } else e = eNext;
        }
        if (e.PrevInSEL !== null) e.PrevInSEL.NextInSEL = null;
        else break;
      }
      this.m_SortedEdges = null;
    };
    ClipperLib.Clipper.prototype.EdgesAdjacent = function(inode) {
      return inode.Edge1.NextInSEL == inode.Edge2 || inode.Edge1.PrevInSEL == inode.Edge2;
    };
    ClipperLib.Clipper.IntersectNodeSort = function(node1, node2) {
      return node2.Pt.Y - node1.Pt.Y;
    };
    ClipperLib.Clipper.prototype.FixupIntersectionOrder = function() {
      this.m_IntersectList.sort(this.m_IntersectNodeComparer);
      this.CopyAELToSEL();
      var cnt = this.m_IntersectList.length;
      for (var i = 0; i < cnt; i++) {
        if (!this.EdgesAdjacent(this.m_IntersectList[i])) {
          var j = i + 1;
          while (j < cnt && !this.EdgesAdjacent(this.m_IntersectList[j])) j++;
          if (j == cnt) return false;
          var tmp = this.m_IntersectList[i];
          this.m_IntersectList[i] = this.m_IntersectList[j];
          this.m_IntersectList[j] = tmp;
        }
        this.SwapPositionsInSEL(this.m_IntersectList[i].Edge1, this.m_IntersectList[i].Edge2);
      }
      return true;
    };
    ClipperLib.Clipper.prototype.ProcessIntersectList = function() {
      for (var i = 0, ilen = this.m_IntersectList.length; i < ilen; i++) {
        var iNode = this.m_IntersectList[i];
        this.IntersectEdges(iNode.Edge1, iNode.Edge2, iNode.Pt, true);
        this.SwapPositionsInAEL(iNode.Edge1, iNode.Edge2);
      }
      this.m_IntersectList.length = 0;
    };
    var R1 = function(a) {
      return a < 0 ? Math.ceil(a - .5) : Math.round(a);
    };
    var R2 = function(a) {
      return a < 0 ? Math.ceil(a - .5) : Math.floor(a + .5);
    };
    var R3 = function(a) {
      return a < 0 ? -Math.round(Math.abs(a)) : Math.round(a);
    };
    var R4 = function(a) {
      if (a < 0) {
        a -= .5;
        return a < -2147483648 ? Math.ceil(a) : a | 0;
      } else {
        a += .5;
        return a > 2147483647 ? Math.floor(a) : a | 0;
      }
    };
    if (browser.msie) ClipperLib.Clipper.Round = R1;
    else if (browser.chromium) ClipperLib.Clipper.Round = R3;
    else if (browser.safari) ClipperLib.Clipper.Round = R4;
    else ClipperLib.Clipper.Round = R2;
    ClipperLib.Clipper.TopX = function(edge, currentY) {
      if (currentY == edge.Top.Y) return edge.Top.X;
      return edge.Bot.X + ClipperLib.Clipper.Round(edge.Dx * (currentY - edge.Bot.Y));
    };
    ClipperLib.Clipper.prototype.IntersectPoint = function(edge1, edge2, ip) {
      ip.X = 0;
      ip.Y = 0;
      var b1, b2;
      if (ClipperLib.ClipperBase.SlopesEqual(edge1, edge2, this.m_UseFullRange) || edge1.Dx == edge2.Dx) {
        if (edge2.Bot.Y > edge1.Bot.Y) {
          ip.X = edge2.Bot.X;
          ip.Y = edge2.Bot.Y;
        } else {
          ip.X = edge1.Bot.X;
          ip.Y = edge1.Bot.Y;
        }
        return false;
      } else if (edge1.Delta.X === 0) {
        ip.X = edge1.Bot.X;
        if (ClipperLib.ClipperBase.IsHorizontal(edge2)) ip.Y = edge2.Bot.Y;
        else {
          b2 = edge2.Bot.Y - edge2.Bot.X / edge2.Dx;
          ip.Y = ClipperLib.Clipper.Round(ip.X / edge2.Dx + b2);
        }
      } else if (edge2.Delta.X === 0) {
        ip.X = edge2.Bot.X;
        if (ClipperLib.ClipperBase.IsHorizontal(edge1)) ip.Y = edge1.Bot.Y;
        else {
          b1 = edge1.Bot.Y - edge1.Bot.X / edge1.Dx;
          ip.Y = ClipperLib.Clipper.Round(ip.X / edge1.Dx + b1);
        }
      } else {
        b1 = edge1.Bot.X - edge1.Bot.Y * edge1.Dx;
        b2 = edge2.Bot.X - edge2.Bot.Y * edge2.Dx;
        var q = (b2 - b1) / (edge1.Dx - edge2.Dx);
        ip.Y = ClipperLib.Clipper.Round(q);
        if (Math.abs(edge1.Dx) < Math.abs(edge2.Dx)) ip.X = ClipperLib.Clipper.Round(edge1.Dx * q + b1);
        else ip.X = ClipperLib.Clipper.Round(edge2.Dx * q + b2);
      }
      if (ip.Y < edge1.Top.Y || ip.Y < edge2.Top.Y) {
        if (edge1.Top.Y > edge2.Top.Y) {
          ip.Y = edge1.Top.Y;
          ip.X = ClipperLib.Clipper.TopX(edge2, edge1.Top.Y);
          return ip.X < edge1.Top.X;
        } else ip.Y = edge2.Top.Y;
        if (Math.abs(edge1.Dx) < Math.abs(edge2.Dx)) ip.X = ClipperLib.Clipper.TopX(edge1, ip.Y);
        else ip.X = ClipperLib.Clipper.TopX(edge2, ip.Y);
      }
      return true;
    };
    ClipperLib.Clipper.prototype.ProcessEdgesAtTopOfScanbeam = function(topY) {
      var e = this.m_ActiveEdges;
      while (e !== null) {
        var IsMaximaEdge = this.IsMaxima(e, topY);
        if (IsMaximaEdge) {
          var eMaxPair = this.GetMaximaPair(e);
          IsMaximaEdge = eMaxPair === null || !ClipperLib.ClipperBase.IsHorizontal(eMaxPair);
        }
        if (IsMaximaEdge) {
          var ePrev = e.PrevInAEL;
          this.DoMaxima(e);
          if (ePrev === null) e = this.m_ActiveEdges;
          else e = ePrev.NextInAEL;
        } else {
          if (this.IsIntermediate(e, topY) && ClipperLib.ClipperBase.IsHorizontal(e.NextInLML)) {
            e = this.UpdateEdgeIntoAEL(e);
            if (e.OutIdx >= 0) this.AddOutPt(e, e.Bot);
            this.AddEdgeToSEL(e);
          } else {
            e.Curr.X = ClipperLib.Clipper.TopX(e, topY);
            e.Curr.Y = topY;
          }
          if (this.StrictlySimple) {
            var ePrev = e.PrevInAEL;
            if (e.OutIdx >= 0 && e.WindDelta !== 0 && ePrev !== null && ePrev.OutIdx >= 0 && ePrev.Curr.X == e.Curr.X && ePrev.WindDelta !== 0) {
              var op = this.AddOutPt(ePrev, e.Curr);
              var op2 = this.AddOutPt(e, e.Curr);
              this.AddJoin(op, op2, e.Curr);
            }
          }
          e = e.NextInAEL;
        }
      }
      this.ProcessHorizontals(true);
      e = this.m_ActiveEdges;
      while (e !== null) {
        if (this.IsIntermediate(e, topY)) {
          var op = null;
          if (e.OutIdx >= 0) op = this.AddOutPt(e, e.Top);
          e = this.UpdateEdgeIntoAEL(e);
          var ePrev = e.PrevInAEL;
          var eNext = e.NextInAEL;
          if (ePrev !== null && ePrev.Curr.X == e.Bot.X && ePrev.Curr.Y == e.Bot.Y && op !== null && ePrev.OutIdx >= 0 && ePrev.Curr.Y > ePrev.Top.Y && ClipperLib.ClipperBase.SlopesEqual(e, ePrev, this.m_UseFullRange) && e.WindDelta !== 0 && ePrev.WindDelta !== 0) {
            var op2 = this.AddOutPt(ePrev, e.Bot);
            this.AddJoin(op, op2, e.Top);
          } else if (eNext !== null && eNext.Curr.X == e.Bot.X && eNext.Curr.Y == e.Bot.Y && op !== null && eNext.OutIdx >= 0 && eNext.Curr.Y > eNext.Top.Y && ClipperLib.ClipperBase.SlopesEqual(e, eNext, this.m_UseFullRange) && e.WindDelta !== 0 && eNext.WindDelta !== 0) {
            var op2 = this.AddOutPt(eNext, e.Bot);
            this.AddJoin(op, op2, e.Top);
          }
        }
        e = e.NextInAEL;
      }
    };
    ClipperLib.Clipper.prototype.DoMaxima = function(e) {
      var eMaxPair = this.GetMaximaPair(e);
      if (eMaxPair === null) {
        if (e.OutIdx >= 0) this.AddOutPt(e, e.Top);
        this.DeleteFromAEL(e);
        return;
      }
      var eNext = e.NextInAEL;
      var use_lines = true;
      while (eNext !== null && eNext != eMaxPair) {
        this.IntersectEdges(e, eNext, e.Top, true);
        this.SwapPositionsInAEL(e, eNext);
        eNext = e.NextInAEL;
      }
      if (e.OutIdx == -1 && eMaxPair.OutIdx == -1) {
        this.DeleteFromAEL(e);
        this.DeleteFromAEL(eMaxPair);
      } else if (e.OutIdx >= 0 && eMaxPair.OutIdx >= 0) this.IntersectEdges(e, eMaxPair, e.Top, false);
      else if (use_lines && e.WindDelta === 0) {
        if (e.OutIdx >= 0) {
          this.AddOutPt(e, e.Top);
          e.OutIdx = -1;
        }
        this.DeleteFromAEL(e);
        if (eMaxPair.OutIdx >= 0) {
          this.AddOutPt(eMaxPair, e.Top);
          eMaxPair.OutIdx = -1;
        }
        this.DeleteFromAEL(eMaxPair);
      } else ClipperLib.Error("DoMaxima error");
    };
    ClipperLib.Clipper.ReversePaths = function(polys) {
      for (var i = 0, len = polys.length; i < len; i++) polys[i].reverse();
    };
    ClipperLib.Clipper.Orientation = function(poly) {
      return ClipperLib.Clipper.Area(poly) >= 0;
    };
    ClipperLib.Clipper.prototype.PointCount = function(pts) {
      if (pts === null) return 0;
      var result = 0;
      var p = pts;
      do {
        result++;
        p = p.Next;
      } while (p != pts);
      return result;
    };
    ClipperLib.Clipper.prototype.BuildResult = function(polyg) {
      ClipperLib.Clear(polyg);
      for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
        var outRec = this.m_PolyOuts[i];
        if (outRec.Pts === null) continue;
        var p = outRec.Pts.Prev;
        var cnt = this.PointCount(p);
        if (cnt < 2) continue;
        var pg = new Array(cnt);
        for (var j = 0; j < cnt; j++) {
          pg[j] = p.Pt;
          p = p.Prev;
        }
        polyg.push(pg);
      }
    };
    ClipperLib.Clipper.prototype.BuildResult2 = function(polytree) {
      polytree.Clear();
      for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
        var outRec = this.m_PolyOuts[i];
        var cnt = this.PointCount(outRec.Pts);
        if (outRec.IsOpen && cnt < 2 || !outRec.IsOpen && cnt < 3) continue;
        this.FixHoleLinkage(outRec);
        var pn = new ClipperLib.PolyNode();
        polytree.m_AllPolys.push(pn);
        outRec.PolyNode = pn;
        pn.m_polygon.length = cnt;
        var op = outRec.Pts.Prev;
        for (var j = 0; j < cnt; j++) {
          pn.m_polygon[j] = op.Pt;
          op = op.Prev;
        }
      }
      for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
        var outRec = this.m_PolyOuts[i];
        if (outRec.PolyNode === null) continue;
        else if (outRec.IsOpen) {
          outRec.PolyNode.IsOpen = true;
          polytree.AddChild(outRec.PolyNode);
        } else if (outRec.FirstLeft !== null && outRec.FirstLeft.PolyNode != null) outRec.FirstLeft.PolyNode.AddChild(outRec.PolyNode);
        else polytree.AddChild(outRec.PolyNode);
      }
    };
    ClipperLib.Clipper.prototype.FixupOutPolygon = function(outRec) {
      var lastOK = null;
      outRec.BottomPt = null;
      var pp = outRec.Pts;
      for (;;) {
        if (pp.Prev == pp || pp.Prev == pp.Next) {
          this.DisposeOutPts(pp);
          outRec.Pts = null;
          return;
        }
        if (ClipperLib.IntPoint.op_Equality(pp.Pt, pp.Next.Pt) || ClipperLib.IntPoint.op_Equality(pp.Pt, pp.Prev.Pt) || ClipperLib.ClipperBase.SlopesEqual(pp.Prev.Pt, pp.Pt, pp.Next.Pt, this.m_UseFullRange) && (!this.PreserveCollinear || !this.Pt2IsBetweenPt1AndPt3(pp.Prev.Pt, pp.Pt, pp.Next.Pt))) {
          lastOK = null;
          pp.Prev.Next = pp.Next;
          pp.Next.Prev = pp.Prev;
          pp = pp.Prev;
        } else if (pp == lastOK) break;
        else {
          if (lastOK === null) lastOK = pp;
          pp = pp.Next;
        }
      }
      outRec.Pts = pp;
    };
    ClipperLib.Clipper.prototype.DupOutPt = function(outPt, InsertAfter) {
      var result = new ClipperLib.OutPt();
      result.Pt.X = outPt.Pt.X;
      result.Pt.Y = outPt.Pt.Y;
      result.Idx = outPt.Idx;
      if (InsertAfter) {
        result.Next = outPt.Next;
        result.Prev = outPt;
        outPt.Next.Prev = result;
        outPt.Next = result;
      } else {
        result.Prev = outPt.Prev;
        result.Next = outPt;
        outPt.Prev.Next = result;
        outPt.Prev = result;
      }
      return result;
    };
    ClipperLib.Clipper.prototype.GetOverlap = function(a1, a2, b1, b2, $val) {
      if (a1 < a2) {
        if (b1 < b2) {
          $val.Left = Math.max(a1, b1);
          $val.Right = Math.min(a2, b2);
        } else {
          $val.Left = Math.max(a1, b2);
          $val.Right = Math.min(a2, b1);
        }
      } else if (b1 < b2) {
        $val.Left = Math.max(a2, b1);
        $val.Right = Math.min(a1, b2);
      } else {
        $val.Left = Math.max(a2, b2);
        $val.Right = Math.min(a1, b1);
      }
      return $val.Left < $val.Right;
    };
    ClipperLib.Clipper.prototype.JoinHorz = function(op1, op1b, op2, op2b, Pt, DiscardLeft) {
      var Dir1 = op1.Pt.X > op1b.Pt.X ? ClipperLib.Direction.dRightToLeft : ClipperLib.Direction.dLeftToRight;
      var Dir2 = op2.Pt.X > op2b.Pt.X ? ClipperLib.Direction.dRightToLeft : ClipperLib.Direction.dLeftToRight;
      if (Dir1 == Dir2) return false;
      if (Dir1 == ClipperLib.Direction.dLeftToRight) {
        while (op1.Next.Pt.X <= Pt.X && op1.Next.Pt.X >= op1.Pt.X && op1.Next.Pt.Y == Pt.Y) op1 = op1.Next;
        if (DiscardLeft && op1.Pt.X != Pt.X) op1 = op1.Next;
        op1b = this.DupOutPt(op1, !DiscardLeft);
        if (ClipperLib.IntPoint.op_Inequality(op1b.Pt, Pt)) {
          op1 = op1b;
          op1.Pt.X = Pt.X;
          op1.Pt.Y = Pt.Y;
          op1b = this.DupOutPt(op1, !DiscardLeft);
        }
      } else {
        while (op1.Next.Pt.X >= Pt.X && op1.Next.Pt.X <= op1.Pt.X && op1.Next.Pt.Y == Pt.Y) op1 = op1.Next;
        if (!DiscardLeft && op1.Pt.X != Pt.X) op1 = op1.Next;
        op1b = this.DupOutPt(op1, DiscardLeft);
        if (ClipperLib.IntPoint.op_Inequality(op1b.Pt, Pt)) {
          op1 = op1b;
          op1.Pt.X = Pt.X;
          op1.Pt.Y = Pt.Y;
          op1b = this.DupOutPt(op1, DiscardLeft);
        }
      }
      if (Dir2 == ClipperLib.Direction.dLeftToRight) {
        while (op2.Next.Pt.X <= Pt.X && op2.Next.Pt.X >= op2.Pt.X && op2.Next.Pt.Y == Pt.Y) op2 = op2.Next;
        if (DiscardLeft && op2.Pt.X != Pt.X) op2 = op2.Next;
        op2b = this.DupOutPt(op2, !DiscardLeft);
        if (ClipperLib.IntPoint.op_Inequality(op2b.Pt, Pt)) {
          op2 = op2b;
          op2.Pt.X = Pt.X;
          op2.Pt.Y = Pt.Y;
          op2b = this.DupOutPt(op2, !DiscardLeft);
        }
      } else {
        while (op2.Next.Pt.X >= Pt.X && op2.Next.Pt.X <= op2.Pt.X && op2.Next.Pt.Y == Pt.Y) op2 = op2.Next;
        if (!DiscardLeft && op2.Pt.X != Pt.X) op2 = op2.Next;
        op2b = this.DupOutPt(op2, DiscardLeft);
        if (ClipperLib.IntPoint.op_Inequality(op2b.Pt, Pt)) {
          op2 = op2b;
          op2.Pt.X = Pt.X;
          op2.Pt.Y = Pt.Y;
          op2b = this.DupOutPt(op2, DiscardLeft);
        }
      }
      if (Dir1 == ClipperLib.Direction.dLeftToRight == DiscardLeft) {
        op1.Prev = op2;
        op2.Next = op1;
        op1b.Next = op2b;
        op2b.Prev = op1b;
      } else {
        op1.Next = op2;
        op2.Prev = op1;
        op1b.Prev = op2b;
        op2b.Next = op1b;
      }
      return true;
    };
    ClipperLib.Clipper.prototype.JoinPoints = function(j, outRec1, outRec2) {
      var op1 = j.OutPt1, op1b = new ClipperLib.OutPt();
      var op2 = j.OutPt2, op2b = new ClipperLib.OutPt();
      var isHorizontal = j.OutPt1.Pt.Y == j.OffPt.Y;
      if (isHorizontal && ClipperLib.IntPoint.op_Equality(j.OffPt, j.OutPt1.Pt) && ClipperLib.IntPoint.op_Equality(j.OffPt, j.OutPt2.Pt)) {
        op1b = j.OutPt1.Next;
        while (op1b != op1 && ClipperLib.IntPoint.op_Equality(op1b.Pt, j.OffPt)) op1b = op1b.Next;
        var reverse1 = op1b.Pt.Y > j.OffPt.Y;
        op2b = j.OutPt2.Next;
        while (op2b != op2 && ClipperLib.IntPoint.op_Equality(op2b.Pt, j.OffPt)) op2b = op2b.Next;
        if (reverse1 == op2b.Pt.Y > j.OffPt.Y) return false;
        if (reverse1) {
          op1b = this.DupOutPt(op1, false);
          op2b = this.DupOutPt(op2, true);
          op1.Prev = op2;
          op2.Next = op1;
          op1b.Next = op2b;
          op2b.Prev = op1b;
          j.OutPt1 = op1;
          j.OutPt2 = op1b;
          return true;
        } else {
          op1b = this.DupOutPt(op1, true);
          op2b = this.DupOutPt(op2, false);
          op1.Next = op2;
          op2.Prev = op1;
          op1b.Prev = op2b;
          op2b.Next = op1b;
          j.OutPt1 = op1;
          j.OutPt2 = op1b;
          return true;
        }
      } else if (isHorizontal) {
        op1b = op1;
        while (op1.Prev.Pt.Y == op1.Pt.Y && op1.Prev != op1b && op1.Prev != op2) op1 = op1.Prev;
        while (op1b.Next.Pt.Y == op1b.Pt.Y && op1b.Next != op1 && op1b.Next != op2) op1b = op1b.Next;
        if (op1b.Next == op1 || op1b.Next == op2) return false;
        op2b = op2;
        while (op2.Prev.Pt.Y == op2.Pt.Y && op2.Prev != op2b && op2.Prev != op1b) op2 = op2.Prev;
        while (op2b.Next.Pt.Y == op2b.Pt.Y && op2b.Next != op2 && op2b.Next != op1) op2b = op2b.Next;
        if (op2b.Next == op2 || op2b.Next == op1) return false;
        var $val = {
          Left: null,
          Right: null
        };
        if (!this.GetOverlap(op1.Pt.X, op1b.Pt.X, op2.Pt.X, op2b.Pt.X, $val)) return false;
        var Left = $val.Left;
        var Right = $val.Right;
        var Pt = new ClipperLib.IntPoint();
        var DiscardLeftSide;
        if (op1.Pt.X >= Left && op1.Pt.X <= Right) {
          Pt.X = op1.Pt.X;
          Pt.Y = op1.Pt.Y;
          DiscardLeftSide = op1.Pt.X > op1b.Pt.X;
        } else if (op2.Pt.X >= Left && op2.Pt.X <= Right) {
          Pt.X = op2.Pt.X;
          Pt.Y = op2.Pt.Y;
          DiscardLeftSide = op2.Pt.X > op2b.Pt.X;
        } else if (op1b.Pt.X >= Left && op1b.Pt.X <= Right) {
          Pt.X = op1b.Pt.X;
          Pt.Y = op1b.Pt.Y;
          DiscardLeftSide = op1b.Pt.X > op1.Pt.X;
        } else {
          Pt.X = op2b.Pt.X;
          Pt.Y = op2b.Pt.Y;
          DiscardLeftSide = op2b.Pt.X > op2.Pt.X;
        }
        j.OutPt1 = op1;
        j.OutPt2 = op2;
        return this.JoinHorz(op1, op1b, op2, op2b, Pt, DiscardLeftSide);
      } else {
        op1b = op1.Next;
        while (ClipperLib.IntPoint.op_Equality(op1b.Pt, op1.Pt) && op1b != op1) op1b = op1b.Next;
        var Reverse1 = op1b.Pt.Y > op1.Pt.Y || !ClipperLib.ClipperBase.SlopesEqual(op1.Pt, op1b.Pt, j.OffPt, this.m_UseFullRange);
        if (Reverse1) {
          op1b = op1.Prev;
          while (ClipperLib.IntPoint.op_Equality(op1b.Pt, op1.Pt) && op1b != op1) op1b = op1b.Prev;
          if (op1b.Pt.Y > op1.Pt.Y || !ClipperLib.ClipperBase.SlopesEqual(op1.Pt, op1b.Pt, j.OffPt, this.m_UseFullRange)) return false;
        }
        op2b = op2.Next;
        while (ClipperLib.IntPoint.op_Equality(op2b.Pt, op2.Pt) && op2b != op2) op2b = op2b.Next;
        var Reverse2 = op2b.Pt.Y > op2.Pt.Y || !ClipperLib.ClipperBase.SlopesEqual(op2.Pt, op2b.Pt, j.OffPt, this.m_UseFullRange);
        if (Reverse2) {
          op2b = op2.Prev;
          while (ClipperLib.IntPoint.op_Equality(op2b.Pt, op2.Pt) && op2b != op2) op2b = op2b.Prev;
          if (op2b.Pt.Y > op2.Pt.Y || !ClipperLib.ClipperBase.SlopesEqual(op2.Pt, op2b.Pt, j.OffPt, this.m_UseFullRange)) return false;
        }
        if (op1b == op1 || op2b == op2 || op1b == op2b || outRec1 == outRec2 && Reverse1 == Reverse2) return false;
        if (Reverse1) {
          op1b = this.DupOutPt(op1, false);
          op2b = this.DupOutPt(op2, true);
          op1.Prev = op2;
          op2.Next = op1;
          op1b.Next = op2b;
          op2b.Prev = op1b;
          j.OutPt1 = op1;
          j.OutPt2 = op1b;
          return true;
        } else {
          op1b = this.DupOutPt(op1, true);
          op2b = this.DupOutPt(op2, false);
          op1.Next = op2;
          op2.Prev = op1;
          op1b.Prev = op2b;
          op2b.Next = op1b;
          j.OutPt1 = op1;
          j.OutPt2 = op1b;
          return true;
        }
      }
    };
    ClipperLib.Clipper.GetBounds = function(paths) {
      var i = 0, cnt = paths.length;
      while (i < cnt && paths[i].length == 0) i++;
      if (i == cnt) return new ClipperLib.IntRect(0, 0, 0, 0);
      var result = new ClipperLib.IntRect();
      result.left = paths[i][0].X;
      result.right = result.left;
      result.top = paths[i][0].Y;
      result.bottom = result.top;
      for (; i < cnt; i++) for (var j = 0, jlen = paths[i].length; j < jlen; j++) {
        if (paths[i][j].X < result.left) result.left = paths[i][j].X;
        else if (paths[i][j].X > result.right) result.right = paths[i][j].X;
        if (paths[i][j].Y < result.top) result.top = paths[i][j].Y;
        else if (paths[i][j].Y > result.bottom) result.bottom = paths[i][j].Y;
      }
      return result;
    };
    ClipperLib.Clipper.prototype.GetBounds2 = function(ops) {
      var opStart = ops;
      var result = new ClipperLib.IntRect();
      result.left = ops.Pt.X;
      result.right = ops.Pt.X;
      result.top = ops.Pt.Y;
      result.bottom = ops.Pt.Y;
      ops = ops.Next;
      while (ops != opStart) {
        if (ops.Pt.X < result.left) result.left = ops.Pt.X;
        if (ops.Pt.X > result.right) result.right = ops.Pt.X;
        if (ops.Pt.Y < result.top) result.top = ops.Pt.Y;
        if (ops.Pt.Y > result.bottom) result.bottom = ops.Pt.Y;
        ops = ops.Next;
      }
      return result;
    };
    ClipperLib.Clipper.PointInPolygon = function(pt, path) {
      var result = 0, cnt = path.length;
      if (cnt < 3) return 0;
      var ip = path[0];
      for (var i = 1; i <= cnt; ++i) {
        var ipNext = i == cnt ? path[0] : path[i];
        if (ipNext.Y == pt.Y) {
          if (ipNext.X == pt.X || ip.Y == pt.Y && ipNext.X > pt.X == ip.X < pt.X) return -1;
        }
        if (ip.Y < pt.Y != ipNext.Y < pt.Y) {
          if (ip.X >= pt.X) {
            if (ipNext.X > pt.X) result = 1 - result;
            else {
              var d = (ip.X - pt.X) * (ipNext.Y - pt.Y) - (ipNext.X - pt.X) * (ip.Y - pt.Y);
              if (d == 0) return -1;
              else if (d > 0 == ipNext.Y > ip.Y) result = 1 - result;
            }
          } else if (ipNext.X > pt.X) {
            var d = (ip.X - pt.X) * (ipNext.Y - pt.Y) - (ipNext.X - pt.X) * (ip.Y - pt.Y);
            if (d == 0) return -1;
            else if (d > 0 == ipNext.Y > ip.Y) result = 1 - result;
          }
        }
        ip = ipNext;
      }
      return result;
    };
    ClipperLib.Clipper.prototype.PointInPolygon = function(pt, op) {
      var result = 0;
      var startOp = op;
      for (;;) {
        var poly0x = op.Pt.X, poly0y = op.Pt.Y;
        var poly1x = op.Next.Pt.X, poly1y = op.Next.Pt.Y;
        if (poly1y == pt.Y) {
          if (poly1x == pt.X || poly0y == pt.Y && poly1x > pt.X == poly0x < pt.X) return -1;
        }
        if (poly0y < pt.Y != poly1y < pt.Y) {
          if (poly0x >= pt.X) {
            if (poly1x > pt.X) result = 1 - result;
            else {
              var d = (poly0x - pt.X) * (poly1y - pt.Y) - (poly1x - pt.X) * (poly0y - pt.Y);
              if (d == 0) return -1;
              if (d > 0 == poly1y > poly0y) result = 1 - result;
            }
          } else if (poly1x > pt.X) {
            var d = (poly0x - pt.X) * (poly1y - pt.Y) - (poly1x - pt.X) * (poly0y - pt.Y);
            if (d == 0) return -1;
            if (d > 0 == poly1y > poly0y) result = 1 - result;
          }
        }
        op = op.Next;
        if (startOp == op) break;
      }
      return result;
    };
    ClipperLib.Clipper.prototype.Poly2ContainsPoly1 = function(outPt1, outPt2) {
      var op = outPt1;
      do {
        var res = this.PointInPolygon(op.Pt, outPt2);
        if (res >= 0) return res != 0;
        op = op.Next;
      } while (op != outPt1);
      return true;
    };
    ClipperLib.Clipper.prototype.FixupFirstLefts1 = function(OldOutRec, NewOutRec) {
      for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
        var outRec = this.m_PolyOuts[i];
        if (outRec.Pts !== null && outRec.FirstLeft == OldOutRec) {
          if (this.Poly2ContainsPoly1(outRec.Pts, NewOutRec.Pts)) outRec.FirstLeft = NewOutRec;
        }
      }
    };
    ClipperLib.Clipper.prototype.FixupFirstLefts2 = function(OldOutRec, NewOutRec) {
      for (var $i2 = 0, $t2 = this.m_PolyOuts, $l2 = $t2.length, outRec = $t2[$i2]; $i2 < $l2; $i2++, outRec = $t2[$i2]) if (outRec.FirstLeft == OldOutRec) outRec.FirstLeft = NewOutRec;
    };
    ClipperLib.Clipper.ParseFirstLeft = function(FirstLeft) {
      while (FirstLeft != null && FirstLeft.Pts == null) FirstLeft = FirstLeft.FirstLeft;
      return FirstLeft;
    };
    ClipperLib.Clipper.prototype.JoinCommonEdges = function() {
      for (var i = 0, ilen = this.m_Joins.length; i < ilen; i++) {
        var join = this.m_Joins[i];
        var outRec1 = this.GetOutRec(join.OutPt1.Idx);
        var outRec2 = this.GetOutRec(join.OutPt2.Idx);
        if (outRec1.Pts == null || outRec2.Pts == null) continue;
        var holeStateRec;
        if (outRec1 == outRec2) holeStateRec = outRec1;
        else if (this.Param1RightOfParam2(outRec1, outRec2)) holeStateRec = outRec2;
        else if (this.Param1RightOfParam2(outRec2, outRec1)) holeStateRec = outRec1;
        else holeStateRec = this.GetLowermostRec(outRec1, outRec2);
        if (!this.JoinPoints(join, outRec1, outRec2)) continue;
        if (outRec1 == outRec2) {
          outRec1.Pts = join.OutPt1;
          outRec1.BottomPt = null;
          outRec2 = this.CreateOutRec();
          outRec2.Pts = join.OutPt2;
          this.UpdateOutPtIdxs(outRec2);
          if (this.m_UsingPolyTree) for (var j = 0, jlen = this.m_PolyOuts.length; j < jlen - 1; j++) {
            var oRec = this.m_PolyOuts[j];
            if (oRec.Pts == null || ClipperLib.Clipper.ParseFirstLeft(oRec.FirstLeft) != outRec1 || oRec.IsHole == outRec1.IsHole) continue;
            if (this.Poly2ContainsPoly1(oRec.Pts, join.OutPt2)) oRec.FirstLeft = outRec2;
          }
          if (this.Poly2ContainsPoly1(outRec2.Pts, outRec1.Pts)) {
            outRec2.IsHole = !outRec1.IsHole;
            outRec2.FirstLeft = outRec1;
            if (this.m_UsingPolyTree) this.FixupFirstLefts2(outRec2, outRec1);
            if ((outRec2.IsHole ^ this.ReverseSolution) == this.Area(outRec2) > 0) this.ReversePolyPtLinks(outRec2.Pts);
          } else if (this.Poly2ContainsPoly1(outRec1.Pts, outRec2.Pts)) {
            outRec2.IsHole = outRec1.IsHole;
            outRec1.IsHole = !outRec2.IsHole;
            outRec2.FirstLeft = outRec1.FirstLeft;
            outRec1.FirstLeft = outRec2;
            if (this.m_UsingPolyTree) this.FixupFirstLefts2(outRec1, outRec2);
            if ((outRec1.IsHole ^ this.ReverseSolution) == this.Area(outRec1) > 0) this.ReversePolyPtLinks(outRec1.Pts);
          } else {
            outRec2.IsHole = outRec1.IsHole;
            outRec2.FirstLeft = outRec1.FirstLeft;
            if (this.m_UsingPolyTree) this.FixupFirstLefts1(outRec1, outRec2);
          }
        } else {
          outRec2.Pts = null;
          outRec2.BottomPt = null;
          outRec2.Idx = outRec1.Idx;
          outRec1.IsHole = holeStateRec.IsHole;
          if (holeStateRec == outRec2) outRec1.FirstLeft = outRec2.FirstLeft;
          outRec2.FirstLeft = outRec1;
          if (this.m_UsingPolyTree) this.FixupFirstLefts2(outRec2, outRec1);
        }
      }
    };
    ClipperLib.Clipper.prototype.UpdateOutPtIdxs = function(outrec) {
      var op = outrec.Pts;
      do {
        op.Idx = outrec.Idx;
        op = op.Prev;
      } while (op != outrec.Pts);
    };
    ClipperLib.Clipper.prototype.DoSimplePolygons = function() {
      var i = 0;
      while (i < this.m_PolyOuts.length) {
        var outrec = this.m_PolyOuts[i++];
        var op = outrec.Pts;
        if (op === null) continue;
        do {
          var op2 = op.Next;
          while (op2 != outrec.Pts) {
            if (ClipperLib.IntPoint.op_Equality(op.Pt, op2.Pt) && op2.Next != op && op2.Prev != op) {
              var op3 = op.Prev;
              var op4 = op2.Prev;
              op.Prev = op4;
              op4.Next = op;
              op2.Prev = op3;
              op3.Next = op2;
              outrec.Pts = op;
              var outrec2 = this.CreateOutRec();
              outrec2.Pts = op2;
              this.UpdateOutPtIdxs(outrec2);
              if (this.Poly2ContainsPoly1(outrec2.Pts, outrec.Pts)) {
                outrec2.IsHole = !outrec.IsHole;
                outrec2.FirstLeft = outrec;
              } else if (this.Poly2ContainsPoly1(outrec.Pts, outrec2.Pts)) {
                outrec2.IsHole = outrec.IsHole;
                outrec.IsHole = !outrec2.IsHole;
                outrec2.FirstLeft = outrec.FirstLeft;
                outrec.FirstLeft = outrec2;
              } else {
                outrec2.IsHole = outrec.IsHole;
                outrec2.FirstLeft = outrec.FirstLeft;
              }
              op2 = op;
            }
            op2 = op2.Next;
          }
          op = op.Next;
        } while (op != outrec.Pts);
      }
    };
    ClipperLib.Clipper.Area = function(poly) {
      var cnt = poly.length;
      if (cnt < 3) return 0;
      var a = 0;
      for (var i = 0, j = cnt - 1; i < cnt; ++i) {
        a += (poly[j].X + poly[i].X) * (poly[j].Y - poly[i].Y);
        j = i;
      }
      return -a * .5;
    };
    ClipperLib.Clipper.prototype.Area = function(outRec) {
      var op = outRec.Pts;
      if (op == null) return 0;
      var a = 0;
      do {
        a = a + (op.Prev.Pt.X + op.Pt.X) * (op.Prev.Pt.Y - op.Pt.Y);
        op = op.Next;
      } while (op != outRec.Pts);
      return a * .5;
    };
    if (use_deprecated) ClipperLib.Clipper.OffsetPaths = function(polys, delta, jointype, endtype, MiterLimit) {
      var result = new ClipperLib.Paths();
      var co = new ClipperLib.ClipperOffset(MiterLimit, MiterLimit);
      co.AddPaths(polys, jointype, endtype);
      co.Execute(result, delta);
      return result;
    };
    ClipperLib.Clipper.SimplifyPolygon = function(poly, fillType) {
      var result = new Array();
      var c = new ClipperLib.Clipper(0);
      c.StrictlySimple = true;
      c.AddPath(poly, ClipperLib.PolyType.ptSubject, true);
      c.Execute(ClipperLib.ClipType.ctUnion, result, fillType, fillType);
      return result;
    };
    ClipperLib.Clipper.SimplifyPolygons = function(polys, fillType) {
      if (typeof fillType == "undefined") fillType = ClipperLib.PolyFillType.pftEvenOdd;
      var result = new Array();
      var c = new ClipperLib.Clipper(0);
      c.StrictlySimple = true;
      c.AddPaths(polys, ClipperLib.PolyType.ptSubject, true);
      c.Execute(ClipperLib.ClipType.ctUnion, result, fillType, fillType);
      return result;
    };
    ClipperLib.Clipper.DistanceSqrd = function(pt1, pt2) {
      var dx = pt1.X - pt2.X;
      var dy = pt1.Y - pt2.Y;
      return dx * dx + dy * dy;
    };
    ClipperLib.Clipper.DistanceFromLineSqrd = function(pt, ln1, ln2) {
      var A = ln1.Y - ln2.Y;
      var B = ln2.X - ln1.X;
      var C = A * ln1.X + B * ln1.Y;
      C = A * pt.X + B * pt.Y - C;
      return C * C / (A * A + B * B);
    };
    ClipperLib.Clipper.SlopesNearCollinear = function(pt1, pt2, pt3, distSqrd) {
      return ClipperLib.Clipper.DistanceFromLineSqrd(pt2, pt1, pt3) < distSqrd;
    };
    ClipperLib.Clipper.PointsAreClose = function(pt1, pt2, distSqrd) {
      var dx = pt1.X - pt2.X;
      var dy = pt1.Y - pt2.Y;
      return dx * dx + dy * dy <= distSqrd;
    };
    ClipperLib.Clipper.ExcludeOp = function(op) {
      var result = op.Prev;
      result.Next = op.Next;
      op.Next.Prev = result;
      result.Idx = 0;
      return result;
    };
    ClipperLib.Clipper.CleanPolygon = function(path, distance) {
      if (typeof distance == "undefined") distance = 1.415;
      var cnt = path.length;
      if (cnt == 0) return new Array();
      var outPts = new Array(cnt);
      for (var i = 0; i < cnt; ++i) outPts[i] = new ClipperLib.OutPt();
      for (var i = 0; i < cnt; ++i) {
        outPts[i].Pt = path[i];
        outPts[i].Next = outPts[(i + 1) % cnt];
        outPts[i].Next.Prev = outPts[i];
        outPts[i].Idx = 0;
      }
      var distSqrd = distance * distance;
      var op = outPts[0];
      while (op.Idx == 0 && op.Next != op.Prev) if (ClipperLib.Clipper.PointsAreClose(op.Pt, op.Prev.Pt, distSqrd)) {
        op = ClipperLib.Clipper.ExcludeOp(op);
        cnt--;
      } else if (ClipperLib.Clipper.PointsAreClose(op.Prev.Pt, op.Next.Pt, distSqrd)) {
        ClipperLib.Clipper.ExcludeOp(op.Next);
        op = ClipperLib.Clipper.ExcludeOp(op);
        cnt -= 2;
      } else if (ClipperLib.Clipper.SlopesNearCollinear(op.Prev.Pt, op.Pt, op.Next.Pt, distSqrd)) {
        op = ClipperLib.Clipper.ExcludeOp(op);
        cnt--;
      } else {
        op.Idx = 1;
        op = op.Next;
      }
      if (cnt < 3) cnt = 0;
      var result = new Array(cnt);
      for (var i = 0; i < cnt; ++i) {
        result[i] = new ClipperLib.IntPoint(op.Pt);
        op = op.Next;
      }
      outPts = null;
      return result;
    };
    ClipperLib.Clipper.CleanPolygons = function(polys, distance) {
      var result = new Array(polys.length);
      for (var i = 0, ilen = polys.length; i < ilen; i++) result[i] = ClipperLib.Clipper.CleanPolygon(polys[i], distance);
      return result;
    };
    ClipperLib.Clipper.Minkowski = function(pattern, path, IsSum, IsClosed) {
      var delta = IsClosed ? 1 : 0;
      var polyCnt = pattern.length;
      var pathCnt = path.length;
      var result = new Array();
      if (IsSum) for (var i = 0; i < pathCnt; i++) {
        var p = new Array(polyCnt);
        for (var j = 0, jlen = pattern.length, ip = pattern[j]; j < jlen; j++, ip = pattern[j]) p[j] = new ClipperLib.IntPoint(path[i].X + ip.X, path[i].Y + ip.Y);
        result.push(p);
      }
      else for (var i = 0; i < pathCnt; i++) {
        var p = new Array(polyCnt);
        for (var j = 0, jlen = pattern.length, ip = pattern[j]; j < jlen; j++, ip = pattern[j]) p[j] = new ClipperLib.IntPoint(path[i].X - ip.X, path[i].Y - ip.Y);
        result.push(p);
      }
      var quads = new Array();
      for (var i = 0; i < pathCnt - 1 + delta; i++) for (var j = 0; j < polyCnt; j++) {
        var quad = new Array();
        quad.push(result[i % pathCnt][j % polyCnt]);
        quad.push(result[(i + 1) % pathCnt][j % polyCnt]);
        quad.push(result[(i + 1) % pathCnt][(j + 1) % polyCnt]);
        quad.push(result[i % pathCnt][(j + 1) % polyCnt]);
        if (!ClipperLib.Clipper.Orientation(quad)) quad.reverse();
        quads.push(quad);
      }
      var c = new ClipperLib.Clipper(0);
      c.AddPaths(quads, ClipperLib.PolyType.ptSubject, true);
      c.Execute(ClipperLib.ClipType.ctUnion, result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
      return result;
    };
    ClipperLib.Clipper.MinkowskiSum = function() {
      var a = arguments, alen = a.length;
      if (alen == 3) {
        var pattern = a[0], path = a[1], pathIsClosed = a[2];
        return ClipperLib.Clipper.Minkowski(pattern, path, true, pathIsClosed);
      } else if (alen == 4) {
        var pattern = a[0], paths = a[1], pathFillType = a[2], pathIsClosed = a[3];
        var c = new ClipperLib.Clipper(), tmp;
        for (var i = 0, ilen = paths.length; i < ilen; ++i) {
          var tmp = ClipperLib.Clipper.Minkowski(pattern, paths[i], true, pathIsClosed);
          c.AddPaths(tmp, ClipperLib.PolyType.ptSubject, true);
        }
        if (pathIsClosed) c.AddPaths(paths, ClipperLib.PolyType.ptClip, true);
        var solution = new ClipperLib.Paths();
        c.Execute(ClipperLib.ClipType.ctUnion, solution, pathFillType, pathFillType);
        return solution;
      }
    };
    ClipperLib.Clipper.MinkowskiDiff = function(pattern, path, pathIsClosed) {
      return ClipperLib.Clipper.Minkowski(pattern, path, false, pathIsClosed);
    };
    ClipperLib.Clipper.PolyTreeToPaths = function(polytree) {
      var result = new Array();
      ClipperLib.Clipper.AddPolyNodeToPaths(polytree, ClipperLib.Clipper.NodeType.ntAny, result);
      return result;
    };
    ClipperLib.Clipper.AddPolyNodeToPaths = function(polynode, nt, paths) {
      var match = true;
      switch (nt) {
        case ClipperLib.Clipper.NodeType.ntOpen: return;
        case ClipperLib.Clipper.NodeType.ntClosed: match = !polynode.IsOpen;
      }
      if (polynode.m_polygon.length > 0 && match) paths.push(polynode.m_polygon);
      for (var $i3 = 0, $t3 = polynode.Childs(), $l3 = $t3.length, pn = $t3[$i3]; $i3 < $l3; $i3++, pn = $t3[$i3]) ClipperLib.Clipper.AddPolyNodeToPaths(pn, nt, paths);
    };
    ClipperLib.Clipper.OpenPathsFromPolyTree = function(polytree) {
      var result = new ClipperLib.Paths();
      for (var i = 0, ilen = polytree.ChildCount(); i < ilen; i++) if (polytree.Childs()[i].IsOpen) result.push(polytree.Childs()[i].m_polygon);
      return result;
    };
    ClipperLib.Clipper.ClosedPathsFromPolyTree = function(polytree) {
      var result = new ClipperLib.Paths();
      ClipperLib.Clipper.AddPolyNodeToPaths(polytree, ClipperLib.Clipper.NodeType.ntClosed, result);
      return result;
    };
    Inherit(ClipperLib.Clipper, ClipperLib.ClipperBase);
    ClipperLib.Clipper.NodeType = {
      ntAny: 0,
      ntOpen: 1,
      ntClosed: 2
    };
    ClipperLib.ClipperOffset = function(miterLimit, arcTolerance) {
      if (typeof miterLimit == "undefined") miterLimit = 2;
      if (typeof arcTolerance == "undefined") arcTolerance = ClipperLib.ClipperOffset.def_arc_tolerance;
      this.m_destPolys = new ClipperLib.Paths();
      this.m_srcPoly = new ClipperLib.Path();
      this.m_destPoly = new ClipperLib.Path();
      this.m_normals = new Array();
      this.m_delta = 0;
      this.m_sinA = 0;
      this.m_sin = 0;
      this.m_cos = 0;
      this.m_miterLim = 0;
      this.m_StepsPerRad = 0;
      this.m_lowest = new ClipperLib.IntPoint();
      this.m_polyNodes = new ClipperLib.PolyNode();
      this.MiterLimit = miterLimit;
      this.ArcTolerance = arcTolerance;
      this.m_lowest.X = -1;
    };
    ClipperLib.ClipperOffset.two_pi = 6.28318530717959;
    ClipperLib.ClipperOffset.def_arc_tolerance = .25;
    ClipperLib.ClipperOffset.prototype.Clear = function() {
      ClipperLib.Clear(this.m_polyNodes.Childs());
      this.m_lowest.X = -1;
    };
    ClipperLib.ClipperOffset.Round = ClipperLib.Clipper.Round;
    ClipperLib.ClipperOffset.prototype.AddPath = function(path, joinType, endType) {
      var highI = path.length - 1;
      if (highI < 0) return;
      var newNode = new ClipperLib.PolyNode();
      newNode.m_jointype = joinType;
      newNode.m_endtype = endType;
      if (endType == ClipperLib.EndType.etClosedLine || endType == ClipperLib.EndType.etClosedPolygon) while (highI > 0 && ClipperLib.IntPoint.op_Equality(path[0], path[highI])) highI--;
      newNode.m_polygon.push(path[0]);
      var j = 0, k = 0;
      for (var i = 1; i <= highI; i++) if (ClipperLib.IntPoint.op_Inequality(newNode.m_polygon[j], path[i])) {
        j++;
        newNode.m_polygon.push(path[i]);
        if (path[i].Y > newNode.m_polygon[k].Y || path[i].Y == newNode.m_polygon[k].Y && path[i].X < newNode.m_polygon[k].X) k = j;
      }
      if (endType == ClipperLib.EndType.etClosedPolygon && j < 2 || endType != ClipperLib.EndType.etClosedPolygon && j < 0) return;
      this.m_polyNodes.AddChild(newNode);
      if (endType != ClipperLib.EndType.etClosedPolygon) return;
      if (this.m_lowest.X < 0) this.m_lowest = new ClipperLib.IntPoint(0, k);
      else {
        var ip = this.m_polyNodes.Childs()[this.m_lowest.X].m_polygon[this.m_lowest.Y];
        if (newNode.m_polygon[k].Y > ip.Y || newNode.m_polygon[k].Y == ip.Y && newNode.m_polygon[k].X < ip.X) this.m_lowest = new ClipperLib.IntPoint(this.m_polyNodes.ChildCount() - 1, k);
      }
    };
    ClipperLib.ClipperOffset.prototype.AddPaths = function(paths, joinType, endType) {
      for (var i = 0, ilen = paths.length; i < ilen; i++) this.AddPath(paths[i], joinType, endType);
    };
    ClipperLib.ClipperOffset.prototype.FixOrientations = function() {
      if (this.m_lowest.X >= 0 && !ClipperLib.Clipper.Orientation(this.m_polyNodes.Childs()[this.m_lowest.X].m_polygon)) for (var i = 0; i < this.m_polyNodes.ChildCount(); i++) {
        var node = this.m_polyNodes.Childs()[i];
        if (node.m_endtype == ClipperLib.EndType.etClosedPolygon || node.m_endtype == ClipperLib.EndType.etClosedLine && ClipperLib.Clipper.Orientation(node.m_polygon)) node.m_polygon.reverse();
      }
      else for (var i = 0; i < this.m_polyNodes.ChildCount(); i++) {
        var node = this.m_polyNodes.Childs()[i];
        if (node.m_endtype == ClipperLib.EndType.etClosedLine && !ClipperLib.Clipper.Orientation(node.m_polygon)) node.m_polygon.reverse();
      }
    };
    ClipperLib.ClipperOffset.GetUnitNormal = function(pt1, pt2) {
      var dx = pt2.X - pt1.X;
      var dy = pt2.Y - pt1.Y;
      if (dx == 0 && dy == 0) return new ClipperLib.DoublePoint(0, 0);
      var f = 1 / Math.sqrt(dx * dx + dy * dy);
      dx *= f;
      dy *= f;
      return new ClipperLib.DoublePoint(dy, -dx);
    };
    ClipperLib.ClipperOffset.prototype.DoOffset = function(delta) {
      this.m_destPolys = new Array();
      this.m_delta = delta;
      if (ClipperLib.ClipperBase.near_zero(delta)) {
        for (var i = 0; i < this.m_polyNodes.ChildCount(); i++) {
          var node = this.m_polyNodes.Childs()[i];
          if (node.m_endtype == ClipperLib.EndType.etClosedPolygon) this.m_destPolys.push(node.m_polygon);
        }
        return;
      }
      if (this.MiterLimit > 2) this.m_miterLim = 2 / (this.MiterLimit * this.MiterLimit);
      else this.m_miterLim = .5;
      var y;
      if (this.ArcTolerance <= 0) y = ClipperLib.ClipperOffset.def_arc_tolerance;
      else if (this.ArcTolerance > Math.abs(delta) * ClipperLib.ClipperOffset.def_arc_tolerance) y = Math.abs(delta) * ClipperLib.ClipperOffset.def_arc_tolerance;
      else y = this.ArcTolerance;
      var steps = 3.14159265358979 / Math.acos(1 - y / Math.abs(delta));
      this.m_sin = Math.sin(ClipperLib.ClipperOffset.two_pi / steps);
      this.m_cos = Math.cos(ClipperLib.ClipperOffset.two_pi / steps);
      this.m_StepsPerRad = steps / ClipperLib.ClipperOffset.two_pi;
      if (delta < 0) this.m_sin = -this.m_sin;
      for (var i = 0; i < this.m_polyNodes.ChildCount(); i++) {
        var node = this.m_polyNodes.Childs()[i];
        this.m_srcPoly = node.m_polygon;
        var len = this.m_srcPoly.length;
        if (len == 0 || delta <= 0 && (len < 3 || node.m_endtype != ClipperLib.EndType.etClosedPolygon)) continue;
        this.m_destPoly = new Array();
        if (len == 1) {
          if (node.m_jointype == ClipperLib.JoinType.jtRound) {
            var X = 1, Y = 0;
            for (var j = 1; j <= steps; j++) {
              this.m_destPoly.push(new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].X + X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].Y + Y * delta)));
              var X2 = X;
              X = X * this.m_cos - this.m_sin * Y;
              Y = X2 * this.m_sin + Y * this.m_cos;
            }
          } else {
            var X = -1, Y = -1;
            for (var j = 0; j < 4; ++j) {
              this.m_destPoly.push(new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].X + X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].Y + Y * delta)));
              if (X < 0) X = 1;
              else if (Y < 0) Y = 1;
              else X = -1;
            }
          }
          this.m_destPolys.push(this.m_destPoly);
          continue;
        }
        this.m_normals.length = 0;
        for (var j = 0; j < len - 1; j++) this.m_normals.push(ClipperLib.ClipperOffset.GetUnitNormal(this.m_srcPoly[j], this.m_srcPoly[j + 1]));
        if (node.m_endtype == ClipperLib.EndType.etClosedLine || node.m_endtype == ClipperLib.EndType.etClosedPolygon) this.m_normals.push(ClipperLib.ClipperOffset.GetUnitNormal(this.m_srcPoly[len - 1], this.m_srcPoly[0]));
        else this.m_normals.push(new ClipperLib.DoublePoint(this.m_normals[len - 2]));
        if (node.m_endtype == ClipperLib.EndType.etClosedPolygon) {
          var k = len - 1;
          for (var j = 0; j < len; j++) k = this.OffsetPoint(j, k, node.m_jointype);
          this.m_destPolys.push(this.m_destPoly);
        } else if (node.m_endtype == ClipperLib.EndType.etClosedLine) {
          var k = len - 1;
          for (var j = 0; j < len; j++) k = this.OffsetPoint(j, k, node.m_jointype);
          this.m_destPolys.push(this.m_destPoly);
          this.m_destPoly = new Array();
          var n = this.m_normals[len - 1];
          for (var j = len - 1; j > 0; j--) this.m_normals[j] = new ClipperLib.DoublePoint(-this.m_normals[j - 1].X, -this.m_normals[j - 1].Y);
          this.m_normals[0] = new ClipperLib.DoublePoint(-n.X, -n.Y);
          k = 0;
          for (var j = len - 1; j >= 0; j--) k = this.OffsetPoint(j, k, node.m_jointype);
          this.m_destPolys.push(this.m_destPoly);
        } else {
          var k = 0;
          for (var j = 1; j < len - 1; ++j) k = this.OffsetPoint(j, k, node.m_jointype);
          var pt1;
          if (node.m_endtype == ClipperLib.EndType.etOpenButt) {
            var j = len - 1;
            pt1 = new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_normals[j].X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_normals[j].Y * delta));
            this.m_destPoly.push(pt1);
            pt1 = new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X - this.m_normals[j].X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y - this.m_normals[j].Y * delta));
            this.m_destPoly.push(pt1);
          } else {
            var j = len - 1;
            k = len - 2;
            this.m_sinA = 0;
            this.m_normals[j] = new ClipperLib.DoublePoint(-this.m_normals[j].X, -this.m_normals[j].Y);
            if (node.m_endtype == ClipperLib.EndType.etOpenSquare) this.DoSquare(j, k);
            else this.DoRound(j, k);
          }
          for (var j = len - 1; j > 0; j--) this.m_normals[j] = new ClipperLib.DoublePoint(-this.m_normals[j - 1].X, -this.m_normals[j - 1].Y);
          this.m_normals[0] = new ClipperLib.DoublePoint(-this.m_normals[1].X, -this.m_normals[1].Y);
          k = len - 1;
          for (var j = k - 1; j > 0; --j) k = this.OffsetPoint(j, k, node.m_jointype);
          if (node.m_endtype == ClipperLib.EndType.etOpenButt) {
            pt1 = new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].X - this.m_normals[0].X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].Y - this.m_normals[0].Y * delta));
            this.m_destPoly.push(pt1);
            pt1 = new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].X + this.m_normals[0].X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].Y + this.m_normals[0].Y * delta));
            this.m_destPoly.push(pt1);
          } else {
            k = 1;
            this.m_sinA = 0;
            if (node.m_endtype == ClipperLib.EndType.etOpenSquare) this.DoSquare(0, 1);
            else this.DoRound(0, 1);
          }
          this.m_destPolys.push(this.m_destPoly);
        }
      }
    };
    ClipperLib.ClipperOffset.prototype.Execute = function() {
      var a = arguments;
      if (!(a[0] instanceof ClipperLib.PolyTree)) {
        var solution = a[0], delta = a[1];
        ClipperLib.Clear(solution);
        this.FixOrientations();
        this.DoOffset(delta);
        var clpr = new ClipperLib.Clipper(0);
        clpr.AddPaths(this.m_destPolys, ClipperLib.PolyType.ptSubject, true);
        if (delta > 0) clpr.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
        else {
          var r = ClipperLib.Clipper.GetBounds(this.m_destPolys);
          var outer = new ClipperLib.Path();
          outer.push(new ClipperLib.IntPoint(r.left - 10, r.bottom + 10));
          outer.push(new ClipperLib.IntPoint(r.right + 10, r.bottom + 10));
          outer.push(new ClipperLib.IntPoint(r.right + 10, r.top - 10));
          outer.push(new ClipperLib.IntPoint(r.left - 10, r.top - 10));
          clpr.AddPath(outer, ClipperLib.PolyType.ptSubject, true);
          clpr.ReverseSolution = true;
          clpr.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftNegative, ClipperLib.PolyFillType.pftNegative);
          if (solution.length > 0) solution.splice(0, 1);
        }
      } else {
        var solution = a[0], delta = a[1];
        solution.Clear();
        this.FixOrientations();
        this.DoOffset(delta);
        var clpr = new ClipperLib.Clipper(0);
        clpr.AddPaths(this.m_destPolys, ClipperLib.PolyType.ptSubject, true);
        if (delta > 0) clpr.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
        else {
          var r = ClipperLib.Clipper.GetBounds(this.m_destPolys);
          var outer = new ClipperLib.Path();
          outer.push(new ClipperLib.IntPoint(r.left - 10, r.bottom + 10));
          outer.push(new ClipperLib.IntPoint(r.right + 10, r.bottom + 10));
          outer.push(new ClipperLib.IntPoint(r.right + 10, r.top - 10));
          outer.push(new ClipperLib.IntPoint(r.left - 10, r.top - 10));
          clpr.AddPath(outer, ClipperLib.PolyType.ptSubject, true);
          clpr.ReverseSolution = true;
          clpr.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftNegative, ClipperLib.PolyFillType.pftNegative);
          if (solution.ChildCount() == 1 && solution.Childs()[0].ChildCount() > 0) {
            var outerNode = solution.Childs()[0];
            solution.Childs()[0] = outerNode.Childs()[0];
            for (var i = 1; i < outerNode.ChildCount(); i++) solution.AddChild(outerNode.Childs()[i]);
          } else solution.Clear();
        }
      }
    };
    ClipperLib.ClipperOffset.prototype.OffsetPoint = function(j, k, jointype) {
      this.m_sinA = this.m_normals[k].X * this.m_normals[j].Y - this.m_normals[j].X * this.m_normals[k].Y;
      if (this.m_sinA < 5e-5 && this.m_sinA > -5e-5) return k;
      else if (this.m_sinA > 1) this.m_sinA = 1;
      else if (this.m_sinA < -1) this.m_sinA = -1;
      if (this.m_sinA * this.m_delta < 0) {
        this.m_destPoly.push(new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_normals[k].X * this.m_delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_normals[k].Y * this.m_delta)));
        this.m_destPoly.push(new ClipperLib.IntPoint(this.m_srcPoly[j]));
        this.m_destPoly.push(new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_normals[j].X * this.m_delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_normals[j].Y * this.m_delta)));
      } else switch (jointype) {
        case ClipperLib.JoinType.jtMiter:
          var r = 1 + (this.m_normals[j].X * this.m_normals[k].X + this.m_normals[j].Y * this.m_normals[k].Y);
          if (r >= this.m_miterLim) this.DoMiter(j, k, r);
          else this.DoSquare(j, k);
          break;
        case ClipperLib.JoinType.jtSquare:
          this.DoSquare(j, k);
          break;
        case ClipperLib.JoinType.jtRound:
          this.DoRound(j, k);
          break;
      }
      k = j;
      return k;
    };
    ClipperLib.ClipperOffset.prototype.DoSquare = function(j, k) {
      var dx = Math.tan(Math.atan2(this.m_sinA, this.m_normals[k].X * this.m_normals[j].X + this.m_normals[k].Y * this.m_normals[j].Y) / 4);
      this.m_destPoly.push(new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_delta * (this.m_normals[k].X - this.m_normals[k].Y * dx)), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_delta * (this.m_normals[k].Y + this.m_normals[k].X * dx))));
      this.m_destPoly.push(new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_delta * (this.m_normals[j].X + this.m_normals[j].Y * dx)), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_delta * (this.m_normals[j].Y - this.m_normals[j].X * dx))));
    };
    ClipperLib.ClipperOffset.prototype.DoMiter = function(j, k, r) {
      var q = this.m_delta / r;
      this.m_destPoly.push(new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + (this.m_normals[k].X + this.m_normals[j].X) * q), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + (this.m_normals[k].Y + this.m_normals[j].Y) * q)));
    };
    ClipperLib.ClipperOffset.prototype.DoRound = function(j, k) {
      var a = Math.atan2(this.m_sinA, this.m_normals[k].X * this.m_normals[j].X + this.m_normals[k].Y * this.m_normals[j].Y);
      var steps = ClipperLib.Cast_Int32(ClipperLib.ClipperOffset.Round(this.m_StepsPerRad * Math.abs(a)));
      var X = this.m_normals[k].X, Y = this.m_normals[k].Y, X2;
      for (var i = 0; i < steps; ++i) {
        this.m_destPoly.push(new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + X * this.m_delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + Y * this.m_delta)));
        X2 = X;
        X = X * this.m_cos - this.m_sin * Y;
        Y = X2 * this.m_sin + Y * this.m_cos;
      }
      this.m_destPoly.push(new ClipperLib.IntPoint(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_normals[j].X * this.m_delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_normals[j].Y * this.m_delta)));
    };
    ClipperLib.Error = function(message) {
      try {
        throw new Error(message);
      } catch (err) {
        alert(err.message);
      }
    };
    ClipperLib.JS = {};
    ClipperLib.JS.AreaOfPolygon = function(poly, scale) {
      if (!scale) scale = 1;
      return ClipperLib.Clipper.Area(poly) / (scale * scale);
    };
    ClipperLib.JS.AreaOfPolygons = function(poly, scale) {
      if (!scale) scale = 1;
      var area = 0;
      for (var i = 0; i < poly.length; i++) area += ClipperLib.Clipper.Area(poly[i]);
      return area / (scale * scale);
    };
    ClipperLib.JS.BoundsOfPath = function(path, scale) {
      return ClipperLib.JS.BoundsOfPaths([path], scale);
    };
    ClipperLib.JS.BoundsOfPaths = function(paths, scale) {
      if (!scale) scale = 1;
      var bounds = ClipperLib.Clipper.GetBounds(paths);
      bounds.left /= scale;
      bounds.bottom /= scale;
      bounds.right /= scale;
      bounds.top /= scale;
      return bounds;
    };
    ClipperLib.JS.Clean = function(polygon, delta) {
      if (!(polygon instanceof Array)) return [];
      var isPolygons = polygon[0] instanceof Array;
      var polygon = ClipperLib.JS.Clone(polygon);
      if (typeof delta != "number" || delta === null) {
        ClipperLib.Error("Delta is not a number in Clean().");
        return polygon;
      }
      if (polygon.length === 0 || polygon.length == 1 && polygon[0].length === 0 || delta < 0) return polygon;
      if (!isPolygons) polygon = [polygon];
      var k_length = polygon.length;
      var len, poly, result, d, p, j, i;
      var results = [];
      for (var k = 0; k < k_length; k++) {
        poly = polygon[k];
        len = poly.length;
        if (len === 0) continue;
        else if (len < 3) {
          result = poly;
          results.push(result);
          continue;
        }
        result = poly;
        d = delta * delta;
        p = poly[0];
        j = 1;
        for (i = 1; i < len; i++) {
          if ((poly[i].X - p.X) * (poly[i].X - p.X) + (poly[i].Y - p.Y) * (poly[i].Y - p.Y) <= d) continue;
          result[j] = poly[i];
          p = poly[i];
          j++;
        }
        p = poly[j - 1];
        if ((poly[0].X - p.X) * (poly[0].X - p.X) + (poly[0].Y - p.Y) * (poly[0].Y - p.Y) <= d) j--;
        if (j < len) result.splice(j, len - j);
        if (result.length) results.push(result);
      }
      if (!isPolygons && results.length) results = results[0];
      else if (!isPolygons && results.length === 0) results = [];
      else if (isPolygons && results.length === 0) results = [[]];
      return results;
    };
    ClipperLib.JS.Clone = function(polygon) {
      if (!(polygon instanceof Array)) return [];
      if (polygon.length === 0) return [];
      else if (polygon.length == 1 && polygon[0].length === 0) return [[]];
      var isPolygons = polygon[0] instanceof Array;
      if (!isPolygons) polygon = [polygon];
      var len = polygon.length, plen, i, j, result;
      var results = new Array(len);
      for (i = 0; i < len; i++) {
        plen = polygon[i].length;
        result = new Array(plen);
        for (j = 0; j < plen; j++) result[j] = {
          X: polygon[i][j].X,
          Y: polygon[i][j].Y
        };
        results[i] = result;
      }
      if (!isPolygons) results = results[0];
      return results;
    };
    ClipperLib.JS.Lighten = function(polygon, tolerance) {
      if (!(polygon instanceof Array)) return [];
      if (typeof tolerance != "number" || tolerance === null) {
        ClipperLib.Error("Tolerance is not a number in Lighten().");
        return ClipperLib.JS.Clone(polygon);
      }
      if (polygon.length === 0 || polygon.length == 1 && polygon[0].length === 0 || tolerance < 0) return ClipperLib.JS.Clone(polygon);
      if (!(polygon[0] instanceof Array)) polygon = [polygon];
      var i, j, poly, k, poly2, plen, A, B, P, d, rem, addlast;
      var bxax, byay, l, ax, ay;
      var len = polygon.length;
      var toleranceSq = tolerance * tolerance;
      var results = [];
      for (i = 0; i < len; i++) {
        poly = polygon[i];
        plen = poly.length;
        if (plen == 0) continue;
        for (k = 0; k < 1e6; k++) {
          poly2 = [];
          plen = poly.length;
          if (poly[plen - 1].X != poly[0].X || poly[plen - 1].Y != poly[0].Y) {
            addlast = 1;
            poly.push({
              X: poly[0].X,
              Y: poly[0].Y
            });
            plen = poly.length;
          } else addlast = 0;
          rem = [];
          for (j = 0; j < plen - 2; j++) {
            A = poly[j];
            P = poly[j + 1];
            B = poly[j + 2];
            ax = A.X;
            ay = A.Y;
            bxax = B.X - ax;
            byay = B.Y - ay;
            if (bxax !== 0 || byay !== 0) {
              l = ((P.X - ax) * bxax + (P.Y - ay) * byay) / (bxax * bxax + byay * byay);
              if (l > 1) {
                ax = B.X;
                ay = B.Y;
              } else if (l > 0) {
                ax += bxax * l;
                ay += byay * l;
              }
            }
            bxax = P.X - ax;
            byay = P.Y - ay;
            d = bxax * bxax + byay * byay;
            if (d <= toleranceSq) {
              rem[j + 1] = 1;
              j++;
            }
          }
          poly2.push({
            X: poly[0].X,
            Y: poly[0].Y
          });
          for (j = 1; j < plen - 1; j++) if (!rem[j]) poly2.push({
            X: poly[j].X,
            Y: poly[j].Y
          });
          poly2.push({
            X: poly[plen - 1].X,
            Y: poly[plen - 1].Y
          });
          if (addlast) poly.pop();
          if (!rem.length) break;
          else poly = poly2;
        }
        plen = poly2.length;
        if (poly2[plen - 1].X == poly2[0].X && poly2[plen - 1].Y == poly2[0].Y) poly2.pop();
        if (poly2.length > 2) results.push(poly2);
      }
      if (!polygon[0] instanceof Array) results = results[0];
      if (typeof results == "undefined") results = [[]];
      return results;
    };
    ClipperLib.JS.PerimeterOfPath = function(path, closed, scale) {
      if (typeof path == "undefined") return 0;
      var sqrt = Math.sqrt;
      var perimeter = 0;
      var p1, p2, p1x = 0, p1y = 0, p2x = 0, p2y = 0;
      var j = path.length;
      if (j < 2) return 0;
      if (closed) {
        path[j] = path[0];
        j++;
      }
      while (--j) {
        p1 = path[j];
        p1x = p1.X;
        p1y = p1.Y;
        p2 = path[j - 1];
        p2x = p2.X;
        p2y = p2.Y;
        perimeter += sqrt((p1x - p2x) * (p1x - p2x) + (p1y - p2y) * (p1y - p2y));
      }
      if (closed) path.pop();
      return perimeter / scale;
    };
    ClipperLib.JS.PerimeterOfPaths = function(paths, closed, scale) {
      if (!scale) scale = 1;
      var perimeter = 0;
      for (var i = 0; i < paths.length; i++) perimeter += ClipperLib.JS.PerimeterOfPath(paths[i], closed, scale);
      return perimeter;
    };
    ClipperLib.JS.ScaleDownPath = function(path, scale) {
      var i, p;
      if (!scale) scale = 1;
      i = path.length;
      while (i--) {
        p = path[i];
        p.X = p.X / scale;
        p.Y = p.Y / scale;
      }
    };
    ClipperLib.JS.ScaleDownPaths = function(paths, scale) {
      var i, j, p;
      if (!scale) scale = 1;
      i = paths.length;
      while (i--) {
        j = paths[i].length;
        while (j--) {
          p = paths[i][j];
          p.X = p.X / scale;
          p.Y = p.Y / scale;
        }
      }
    };
    ClipperLib.JS.ScaleUpPath = function(path, scale) {
      var i, p, round = Math.round;
      if (!scale) scale = 1;
      i = path.length;
      while (i--) {
        p = path[i];
        p.X = round(p.X * scale);
        p.Y = round(p.Y * scale);
      }
    };
    ClipperLib.JS.ScaleUpPaths = function(paths, scale) {
      var i, j, p, round = Math.round;
      if (!scale) scale = 1;
      i = paths.length;
      while (i--) {
        j = paths[i].length;
        while (j--) {
          p = paths[i][j];
          p.X = round(p.X * scale);
          p.Y = round(p.Y * scale);
        }
      }
    };
    ClipperLib.ExPolygons = function() {
      return [];
    };
    ClipperLib.ExPolygon = function() {
      this.outer = null;
      this.holes = null;
    };
    ClipperLib.JS.AddOuterPolyNodeToExPolygons = function(polynode, expolygons) {
      var ep = new ClipperLib.ExPolygon();
      ep.outer = polynode.Contour();
      var childs = polynode.Childs();
      var ilen = childs.length;
      ep.holes = new Array(ilen);
      var node, n, i, j, childs2, jlen;
      for (i = 0; i < ilen; i++) {
        node = childs[i];
        ep.holes[i] = node.Contour();
        for (j = 0, childs2 = node.Childs(), jlen = childs2.length; j < jlen; j++) {
          n = childs2[j];
          ClipperLib.JS.AddOuterPolyNodeToExPolygons(n, expolygons);
        }
      }
      expolygons.push(ep);
    };
    ClipperLib.JS.ExPolygonsToPaths = function(expolygons) {
      var a, i, alen, ilen;
      var paths = new ClipperLib.Paths();
      for (a = 0, alen = expolygons.length; a < alen; a++) {
        paths.push(expolygons[a].outer);
        for (i = 0, ilen = expolygons[a].holes.length; i < ilen; i++) paths.push(expolygons[a].holes[i]);
      }
      return paths;
    };
    ClipperLib.JS.PolyTreeToExPolygons = function(polytree) {
      var expolygons = new ClipperLib.ExPolygons();
      var node, i, childs, ilen;
      for (i = 0, childs = polytree.Childs(), ilen = childs.length; i < ilen; i++) {
        node = childs[i];
        ClipperLib.JS.AddOuterPolyNodeToExPolygons(node, expolygons);
      }
      return expolygons;
    };
  })();
}));
//#endregion
//#region src/bubble-svg.ts
var import_jsclipper_adapter = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
  var ClipperLib = require_jsclipper();
  var DEFAULT_SCALE = Math.pow(10, 5);
  function arrayToObjectNotation(arrayOfPoints) {
    return arrayOfPoints.map(function(point) {
      return {
        X: point[0],
        Y: point[1]
      };
    });
  }
  function objectToArrayNotation(arrayOfPoints) {
    return arrayOfPoints.map(function(point) {
      return [point.X, point.Y];
    });
  }
  function arrayToClipperPaths(arrayOfPaths) {
    return arrayOfPaths.map(arrayToObjectNotation);
  }
  function clipperPathsToArray(arrayOfPaths) {
    return arrayOfPaths.map(objectToArrayNotation);
  }
  var FillType = {
    EVEN_ODD: ClipperLib.PolyFillType.pftEvenOdd,
    NON_ZERO: ClipperLib.PolyFillType.pftNonZero,
    NEGATIVE: ClipperLib.PolyFillType.pftNegative,
    POSITIVE: ClipperLib.PolyFillType.pftPositive
  };
  var ClipType = {
    INTERSECTION: ClipperLib.ClipType.ctIntersection,
    UNION: ClipperLib.ClipType.ctUnion,
    DIFFERENCE: ClipperLib.ClipType.ctDifference,
    XOR: ClipperLib.ClipType.ctXor
  };
  var JoinType = {
    ROUND: ClipperLib.JoinType.jtRound,
    MITER: ClipperLib.JoinType.jtMiter,
    SQUARE: ClipperLib.JoinType.jtSquare
  };
  function clip(subj, clips, clipType, scale, fillType) {
    var scale = scale || DEFAULT_SCALE;
    var fillType = fillType || FillType.NON_ZERO;
    if (!Array.isArray(subj)) throw new Error("Provide subject polygon as an array of paths.");
    if (!Array.isArray(clips)) throw new Error("Provide clip polygons as arrays of paths.");
    if (clips.length == 0) throw new Error("Provide at least one clip.");
    if ("number" != typeof clipType || !(0 <= clipType && clipType < 4)) throw new Error("Provide a valid clip type!");
    var subjPaths = arrayToClipperPaths(subj);
    var clipsPaths = clips.map(arrayToClipperPaths);
    var clipper = new ClipperLib.Clipper();
    ClipperLib.JS.ScaleUpPaths(subjPaths, scale);
    clipper.AddPaths(subjPaths, ClipperLib.PolyType.ptSubject, true);
    clipsPaths.forEach(function(clipPaths) {
      ClipperLib.JS.ScaleUpPaths(clipPaths, scale);
      clipper.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
    });
    var solution = [];
    if (clipper.Execute(clipType, solution, fillType, fillType)) {
      ClipperLib.JS.ScaleDownPaths(solution, scale);
      return clipperPathsToArray(solution);
    }
    return false;
  }
  function intersect(subj, clips) {
    return clip(subj, clips, ClipType.INTERSECTION);
  }
  function union(subj, clips) {
    return clip(subj, clips, ClipType.UNION);
  }
  function diff(subj, clips) {
    return clip(subj, clips, ClipType.DIFFERENCE);
  }
  function xor(subj, clips) {
    return clip(subj, clips, ClipType.XOR);
  }
  /**
  * Construct with an array of THREE.Vector2/3 instead of [x,y]
  */
  Polygon.fromVector = function(shape, holes) {
    var shapeArray = shape.map(function(vector) {
      return [vector.x, vector.y];
    });
    var holesArray = void 0;
    if (holes) holesArray = holes.map(function(hole) {
      return hole.map(function(vector) {
        return [vector.x, vector.y];
      });
    });
    return new Polygon(shapeArray, holesArray);
  };
  function offset(subj, offset, scale, fillType, cleanDelta, miterLimit, arcTolerance, joinType) {
    var scale = scale || DEFAULT_SCALE;
    var fillType = fillType || FillType.NON_ZERO;
    var cleanDelta = cleanDelta || 1 / scale;
    var miterLimit = miterLimit || 2;
    var arcTolerance = arcTolerance || .25;
    var joinType = joinType || JoinType.MITER;
    if (!Array.isArray(subj)) throw new Error("Provide subject polygon as an array of paths.");
    var subjPaths = arrayToClipperPaths(subj);
    ClipperLib.JS.ScaleUpPaths(subjPaths, scale);
    var simplifiedPaths = ClipperLib.Clipper.SimplifyPolygons(subjPaths, fillType);
    var cleanedPaths = ClipperLib.JS.Clean(simplifiedPaths, cleanDelta);
    var clipperOffset = new ClipperLib.ClipperOffset();
    clipperOffset.AddPaths(cleanedPaths, joinType, ClipperLib.EndType.etClosedPolygon);
    var solution = [];
    clipperOffset.Execute(solution, offset * scale);
    ClipperLib.JS.ScaleDownPaths(solution, scale);
    return clipperPathsToArray(solution);
  }
  function Polygon(shape, holes) {
    if (!Array.isArray(shape)) throw new Error("Given shape should be an array of points [x,y].");
    holes = holes || [];
    if (!Array.isArray(holes)) throw new Error("Given holes should be an array of paths.");
    var _shape = shape.concat();
    var _holes = holes.concat();
    if (!Polygon.isCounterClockwise(_shape)) _shape.reverse();
    _holes = _holes.map(function(hole) {
      if (Polygon.isCounterClockwise(hole)) return hole.concat().reverse();
      return hole;
    });
    this._paths = [_shape].concat(_holes);
  }
  Polygon.prototype.clone = function() {
    clonedShape = this.getShape().map(function(vertex) {
      return vertex.concat();
    });
    clonedHoles = this.getHoles().map((function(holePath) {
      return holePath.map(function(vertex) {
        return vertex.concat();
      });
    }));
    return new Polygon(clonedShape, clonedHoles);
  };
  Polygon.prototype.getPaths = function() {
    return this._paths.slice();
  };
  Polygon.prototype.getShape = function() {
    return this._paths.slice(0, 1)[0];
  };
  Polygon.prototype.getHoles = function() {
    return this._paths.slice(1);
  };
  /** use clip method on subject polygon with multiple clip polygons **/
  Polygon.prototype.clipMultiple = function(clipPolygons, clipType) {
    var clipPaths = clipPolygons.map(function(polygon) {
      return polygon.getPaths();
    });
    var solution = clip(this.getPaths(), clipPaths, clipType);
    if (solution) return Polygon.assignShapesAndHoles(solution);
    return false;
  };
  Polygon.prototype.diffMultiple = function(clipPolygons) {
    return this.clipMultiple(clipPolygons, ClipType.DIFFERENCE);
  };
  Polygon.prototype.intersectMultiple = function(clipPolygons) {
    return this.clipMultiple(clipPolygons, ClipType.INTERSECTION);
  };
  Polygon.prototype.unionMultiple = function(clipPolygons) {
    return this.clipMultiple(clipPolygons, ClipType.UNION);
  };
  Polygon.prototype.xorMultiple = function(clipPolygons) {
    return this.clipMultiple(clipPolygons, ClipType.XOR);
  };
  /** use clip method on subject polygon with a single clip polygon **/
  Polygon.prototype.diff = function(clipPolygons) {
    return this.clipMultiple([clipPolygons], ClipType.DIFFERENCE);
  };
  Polygon.prototype.intersect = function(clipPolygons) {
    return this.clipMultiple([clipPolygons], ClipType.INTERSECTION);
  };
  Polygon.prototype.union = function(clipPolygons) {
    return this.clipMultiple([clipPolygons], ClipType.UNION);
  };
  Polygon.prototype.xor = function(clipPolygons) {
    return this.clipMultiple([clipPolygons], ClipType.XOR);
  };
  /** use offset method on subject polygon **/
  Polygon.prototype.offset = function(delta, scale) {
    var solution = offset(this.getPaths(), delta, scale);
    return Polygon.assignShapesAndHoles(solution)[0];
  };
  Polygon.prototype.area = function(scale) {
    scale = scale || DEFAULT_SCALE;
    var path = arrayToObjectNotation(this.getShape());
    ClipperLib.JS.ScaleUpPath(path, scale);
    return ClipperLib.Clipper.Area(path) / (scale * scale);
  };
  Polygon.prototype.containsPoint = function(point, scale) {
    scale = scale || DEFAULT_SCALE;
    var shape = this.getShape();
    var inHoles = this.getHoles().some(function(hole) {
      return Polygon.containsPoint(hole, point, scale);
    });
    return Polygon.containsPoint(shape, point, scale) && !inHoles;
  };
  Polygon.assignShapesAndHoles = function(paths) {
    function separateHolesFromShapes(paths) {
      var holes = [];
      var shapes = [];
      paths.forEach(function(path) {
        if (Polygon.isCounterClockwise(path)) shapes.push(path);
        else holes.push(path);
      });
      return {
        shapes,
        holes
      };
    }
    function groupHolesForShape(holes) {
      return function(shape) {
        return new Polygon(shape, holes.filter(function(hole) {
          return Polygon.contains(shape, hole);
        }));
      };
    }
    var p = separateHolesFromShapes(paths);
    return p.shapes.map(groupHolesForShape(p.holes));
  };
  /**
  * Outputs true if the polygon has a CCW winding
  * @return {Boolean}
  */
  Polygon.isCounterClockwise = function(path) {
    return ClipperLib.Clipper.Orientation(arrayToObjectNotation(path));
  };
  Polygon.contains = function(outer, inner) {
    var _outer = arrayToObjectNotation(outer);
    return arrayToObjectNotation(inner).reduce(function(acc, point) {
      return acc && 0 !== ClipperLib.Clipper.PointInPolygon(point, _outer);
    }, true);
  };
  Polygon.containsPoint = function(path, point, scale) {
    path = arrayToObjectNotation(path);
    ClipperLib.JS.ScaleUpPath(path, scale);
    return 0 !== ClipperLib.Clipper.PointInPolygon({
      X: point[0] * scale,
      Y: point[1] * scale
    }, path);
  };
  module.exports = {
    DEFAULT_SCALE,
    arrayToObjectNotation,
    objectToArrayNotation,
    arrayToClipperPaths,
    clipperPathsToArray,
    FillType,
    ClipType,
    JoinType,
    clip,
    intersect,
    union,
    diff,
    xor,
    offset,
    Polygon,
    ClipperLib
  };
})))(), 1);
var svgDefaultTailLength = 18;
var svgDefaultOffset = Object.freeze({
  x: 0,
  y: 0,
  scalePercent: 100
});
function normalizeSvgTailLength(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new TypeError("Bubble tail length must be greater than zero.");
  return value;
}
function normalizeSvgOffset(value) {
  if (value.length !== 2 && value.length !== 3) throw new TypeError("Bubble offset must be [x, y] or [x, y, scale].");
  const [x, y, scalePercent = 100] = value;
  if (![
    x,
    y,
    scalePercent
  ].every(Number.isFinite) || scalePercent <= 0) throw new TypeError("Bubble offset values must be finite and scale positive.");
  return Object.freeze({
    x,
    y,
    scalePercent
  });
}
var bubbleVisualStyles = Object.freeze([
  "NORMAL",
  "THINKING",
  "DREAMING",
  "YELLING",
  "OFF_PANEL",
  "WAVY",
  "WHISPERING",
  "ANNOUNCEMENT",
  "NARRATION",
  "NO_BUBBLE"
]);
var cloudBodyMinimumSize = Object.freeze({
  height: 96,
  width: 176
});
var emptyBodyMinimumSize = Object.freeze({
  height: 0,
  width: 0
});
function bubbleBodyMinimumSize(...styles) {
  return styles.some((style) => style === "THINKING" || style === "DREAMING") ? cloudBodyMinimumSize : emptyBodyMinimumSize;
}
var contentFitStep = 2;
var contentFitMaximumSteps = 400;
var contentFitCache = /* @__PURE__ */ new Map();
var contentFitCacheLimit = 128;
/**
* The region of a style's body that content may occupy without touching the
* border. Undefined means the style draws no outline around the content.
*/
function contentRegion(style, width, height) {
  switch (style) {
    case "NO_BUBBLE": return;
    case "THINKING":
    case "DREAMING": return cloudValleyPoints(width, height);
    case "YELLING": return burstBodyPoints(width, height);
    case "WAVY": return wavyBodyPoints(width, height);
    case "ANNOUNCEMENT": return roundedRectanglePoints(width, height, 13, 30);
    case "NORMAL":
    case "OFF_PANEL":
    case "WHISPERING":
    case "NARRATION": return roundedRectanglePoints(width, height);
  }
}
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    if (!current || !previous) continue;
    if (current.y > point.y !== previous.y > point.y && point.x < (previous.x - current.x) * (point.y - current.y) / (previous.y - current.y) + current.x) inside = !inside;
  }
  return inside;
}
/**
* Counts the sample points where a centered content box, inflated by the
* clearance, escapes the polygon, plus polygon vertices poking into the box.
* Zero means the content fits inside the outline.
*/
function contentOverflow(polygon, width, height, contentWidth, contentHeight) {
  const halfWidth = contentWidth / 2 + 6;
  const halfHeight = contentHeight / 2 + 6;
  const left = width / 2 - halfWidth;
  const right = width / 2 + halfWidth;
  const top = height / 2 - halfHeight;
  const bottom = height / 2 + halfHeight;
  const outside = (x, y) => pointInPolygon({
    x,
    y
  }, polygon) ? 0 : 1;
  let count = 0;
  const columns = Math.max(1, Math.ceil((right - left) / 4));
  const rows = Math.max(1, Math.ceil((bottom - top) / 4));
  for (let index = 0; index <= columns; index += 1) {
    const sampleX = left + (right - left) * index / columns;
    count += outside(sampleX, top) + outside(sampleX, bottom);
  }
  for (let index = 1; index < rows; index += 1) {
    const sampleY = top + (bottom - top) * index / rows;
    count += outside(left, sampleY) + outside(right, sampleY);
  }
  for (const vertex of polygon) if (vertex.x > left && vertex.x < right && vertex.y > top && vertex.y < bottom) count += 1;
  return count;
}
/**
* Computes the Bubble SVG size whose visible outline encloses a content box of
* the given size with {@link bubbleContentClearance} to spare, for every listed
* style (all styles of a shape transition must fit the same content).
*/
function bubbleBodySizeForContent(input) {
  const contentWidth = Math.max(0, input.contentWidth);
  const contentHeight = Math.max(0, input.contentHeight);
  if (!Number.isFinite(contentWidth) || !Number.isFinite(contentHeight)) throw new TypeError("Bubble content size must be finite.");
  const styles = [...new Set(input.styles)];
  const key = `${styles.join(",")}:${contentWidth}:${contentHeight}`;
  const cached = contentFitCache.get(key);
  if (cached) return cached;
  const overflowAt = (width, height) => styles.reduce((sum, style) => {
    const region = contentRegion(style, width, height);
    return region ? sum + contentOverflow(region, width, height, contentWidth, contentHeight) : sum;
  }, 0);
  const minimum = bubbleBodyMinimumSize(...styles);
  let width = Math.max(contentWidth + 48, minimum.width);
  let height = Math.max(contentHeight + 48, minimum.height);
  for (let step = 0; step < contentFitMaximumSteps && overflowAt(width, height) > 0; step += 1) {
    const wider = overflowAt(width + contentFitStep, height);
    const taller = overflowAt(width, height + contentFitStep);
    if (wider <= taller) width += contentFitStep;
    if (taller <= wider) height += contentFitStep;
  }
  const result = Object.freeze({
    height,
    width
  });
  if (contentFitCache.size >= contentFitCacheLimit) {
    const oldest = contentFitCache.keys().next().value;
    if (oldest !== void 0) contentFitCache.delete(oldest);
  }
  contentFitCache.set(key, result);
  return result;
}
function escapeXml$2(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}
function requireDimension(value, fallback) {
  const normalized = value ?? fallback;
  if (!Number.isFinite(normalized) || normalized <= 0) throw new TypeError("Bubble SVG dimensions must be positive and finite.");
  return normalized;
}
function normalizeDirection(value) {
  if (value === null) return null;
  const direction = value ?? 180;
  if (!Number.isFinite(direction)) throw new TypeError("tailDirection must be finite.");
  return (direction % 360 + 360) % 360;
}
function roundedRectanglePoints(width, height, radius = 18, inset = 24) {
  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  const segmentsPerCorner = 10;
  return [
    {
      centerX: right - radius,
      centerY: top + radius,
      start: -90
    },
    {
      centerX: right - radius,
      centerY: bottom - radius,
      start: 0
    },
    {
      centerX: left + radius,
      centerY: bottom - radius,
      start: 90
    },
    {
      centerX: left + radius,
      centerY: top + radius,
      start: 180
    }
  ].flatMap(({ centerX, centerY, start }) => Array.from({ length: 11 }, (_, index) => {
    const radians = (start + index * 90 / segmentsPerCorner) * Math.PI / 180;
    return {
      x: centerX + Math.cos(radians) * radius,
      y: centerY + Math.sin(radians) * radius
    };
  }));
}
function cross(left, right) {
  return left.x * right.y - left.y * right.x;
}
function subtract(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y
  };
}
function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
function walkPath(points, startIndex, step, requestedDistance) {
  let currentIndex = startIndex;
  let remaining = requestedDistance;
  while (remaining > 0) {
    const nextIndex = (currentIndex + step + points.length) % points.length;
    const current = points[currentIndex];
    const next = points[nextIndex];
    if (!current || !next) throw new Error("Bubble border path is invalid.");
    const segmentLength = distance(current, next);
    if (remaining <= segmentLength) {
      const ratio = remaining / segmentLength;
      return {
        x: current.x + (next.x - current.x) * ratio,
        y: current.y + (next.y - current.y) * ratio
      };
    }
    remaining -= segmentLength;
    currentIndex = nextIndex;
  }
  const result = points[currentIndex];
  if (!result) throw new Error("Bubble border path is empty.");
  return result;
}
function tailGeometryForPolygon(body, center, ray, tipDistance, fixedTip) {
  let selected;
  for (let edgeIndex = 0; edgeIndex < body.length; edgeIndex += 1) {
    const edgeStart = body[edgeIndex];
    const edgeEnd = body[(edgeIndex + 1) % body.length];
    if (!edgeStart || !edgeEnd) continue;
    const segment = subtract(edgeEnd, edgeStart);
    const denominator = cross(ray, segment);
    if (Math.abs(denominator) < 1e-9) continue;
    const fromCenter = subtract(edgeStart, center);
    const rayScale = cross(fromCenter, segment) / denominator;
    const segmentScale = cross(fromCenter, ray) / denominator;
    if (rayScale < 0 || segmentScale < -1e-9 || segmentScale > 1 + 1e-9 || selected && rayScale >= selected.rayScale) continue;
    selected = {
      edgeIndex,
      point: {
        x: center.x + ray.x * rayScale,
        y: center.y + ray.y * rayScale
      },
      rayScale
    };
  }
  if (!selected) throw new Error("Tail ray does not intersect Bubble border.");
  const borderWithIntersection = [
    ...body.slice(0, selected.edgeIndex + 1),
    selected.point,
    ...body.slice(selected.edgeIndex + 1)
  ];
  const intersectionIndex = selected.edgeIndex + 1;
  return {
    borderPoint: selected.point,
    base: [walkPath(borderWithIntersection, intersectionIndex, -1, 9), walkPath(borderWithIntersection, intersectionIndex, 1, 9)],
    tip: {
      x: fixedTip?.x ?? center.x + ray.x * (selected.rayScale + tipDistance),
      y: fixedTip?.y ?? center.y + ray.y * (selected.rayScale + tipDistance)
    }
  };
}
function directionRay(direction) {
  const radians = direction * Math.PI / 180;
  return {
    x: Math.sin(radians),
    y: -Math.cos(radians)
  };
}
function transformPoint(point, center, bodyCenter, scale) {
  return {
    x: bodyCenter.x + (point.x - center.x) * scale,
    y: bodyCenter.y + (point.y - center.y) * scale
  };
}
function transformedBodyGeometry(body, width, height, direction, tailLength, offset) {
  const center = {
    x: width / 2,
    y: height / 2
  };
  const ray = directionRay(direction);
  const baseline = tailGeometryForPolygon(body, center, ray, tailLength);
  const borderRadius = distance(center, baseline.borderPoint);
  const scale = offset.scalePercent / 100;
  const bodyCenter = {
    x: center.x - ray.x * borderRadius * (scale - 1) + offset.x,
    y: center.y - ray.y * borderRadius * (scale - 1) - offset.y
  };
  return {
    body: body.map((point) => transformPoint(point, center, bodyCenter, scale)),
    bodyCenter,
    tip: baseline.tip
  };
}
function polygonPath(points) {
  const first = points[0];
  if (!first) throw new Error("Bubble polygon is empty.");
  return `M ${first.x.toFixed(4)} ${first.y.toFixed(4)} ${points.slice(1).map(({ x, y }) => `L ${x.toFixed(4)} ${y.toFixed(4)}`).join(" ")} Z`;
}
function polygonArea(points) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    if (!next) return area;
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}
function bodyPath(points, fill, border, extra = "") {
  return `<path d="${polygonPath(points)}" fill="${fill}" stroke="${border}" stroke-width="3" stroke-linejoin="round" ${extra}/>`;
}
function unionBodyAndTail(body, bodyCenter, tip, fill, border, extra = "") {
  const tipVector = subtract(tip, bodyCenter);
  const tipDistance = Math.hypot(tipVector.x, tipVector.y);
  if (!(tipDistance > 0)) throw new TypeError("Bubble body center and tail tip must differ.");
  const geometry = tailGeometryForPolygon(body, bodyCenter, {
    x: tipVector.x / tipDistance,
    y: tipVector.y / tipDistance
  }, 0, tip);
  const toClipperPath = (points) => points.map(({ x, y }) => [x, y]);
  const solution = import_jsclipper_adapter.default.union([toClipperPath(body)], [[toClipperPath([
    geometry.base[0],
    geometry.tip,
    geometry.base[1]
  ])]]);
  if (!solution || solution.length === 0) throw new Error("JSClipper failed to union Bubble body and tail.");
  const outer = solution.map((path) => path.map(([x, y]) => ({
    x,
    y
  }))).sort((left, right) => polygonArea(right) - polygonArea(left))[0];
  if (!outer) throw new Error("JSClipper returned an empty Bubble outline.");
  return `<path d="${polygonPath(outer)}" fill="${fill}" stroke="${border}" stroke-width="3" stroke-linejoin="round" data-boolean-operation="union" data-tail-base-on-border="true" ${extra}/>`;
}
/** Relative chord lengths that keep cloud puffs from looking machine-regular. */
var cloudPuffRhythm = Object.freeze([
  1,
  .78,
  1.14,
  .88,
  1.06,
  .8,
  1.2,
  .92
]);
/**
* Returns the valleys between cloud puffs. Every puff bulges outward from the
* polygon through these points, so the polygon is the cloud's inner envelope.
*/
function cloudValleyPoints(width, height) {
  const boxWidth = width - 48;
  const boxHeight = height - 48;
  const centerX = width / 2;
  const centerY = height / 2;
  const nominalChord = Math.min(40, Math.max(22, 20 + Math.min(boxWidth, boxHeight) * .12 + Math.max(boxWidth, boxHeight) * .03));
  const puffHeight = nominalChord * .34;
  const radiusX = Math.max(1, boxWidth / 2 - puffHeight);
  const radiusY = Math.max(1, boxHeight / 2 - puffHeight);
  const exponent = 3;
  const base = (angle) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: centerX + radiusX * Math.sign(cos) * Math.abs(cos) ** (2 / exponent),
      y: centerY + radiusY * Math.sign(sin) * Math.abs(sin) ** (2 / exponent)
    };
  };
  const samples = 720;
  const cumulative = [0];
  let previous = base(-Math.PI / 2);
  for (let index = 1; index <= samples; index += 1) {
    const current = base(-Math.PI / 2 + index * Math.PI * 2 / samples);
    cumulative.push((cumulative[index - 1] ?? 0) + Math.hypot(current.x - previous.x, current.y - previous.y));
    previous = current;
  }
  const perimeter = cumulative[samples] ?? 0;
  const rhythmTotal = cloudPuffRhythm.reduce((sum, value) => sum + value, 0);
  const count = Math.max(8, Math.round(perimeter / (nominalChord * rhythmTotal) * cloudPuffRhythm.length));
  const weights = Array.from({ length: count }, (_, index) => cloudPuffRhythm[index % cloudPuffRhythm.length] ?? 1);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const pointAtLength = (length) => {
    let low = 0;
    let high = samples;
    while (high - low > 1) {
      const middle = low + high >> 1;
      if ((cumulative[middle] ?? 0) <= length) low = middle;
      else high = middle;
    }
    const from = cumulative[low] ?? 0;
    const to = cumulative[high] ?? from;
    const ratio = to > from ? (length - from) / (to - from) : 0;
    return base(-Math.PI / 2 + (low + ratio) * Math.PI * 2 / samples);
  };
  let travelled = 0;
  return weights.map((weight) => {
    const point = pointAtLength(travelled / weightTotal * perimeter);
    travelled += weight;
    return point;
  });
}
function cloudBody(width, height, fill, border) {
  const format = (value) => value.toFixed(4);
  const points = cloudValleyPoints(width, height);
  const first = points[0];
  if (!first) throw new Error("Cloud Bubble path is invalid.");
  const arcs = points.map((_, index) => {
    const from = points[index] ?? first;
    const to = points[(index + 1) % points.length] ?? first;
    const radius = Math.hypot(to.x - from.x, to.y - from.y) * .56;
    return `A ${format(radius)} ${format(radius)} 0 0 1 ${format(to.x)} ${format(to.y)}`;
  });
  return `<path d="M ${format(first.x)} ${format(first.y)} ${arcs.join(" ")} Z" fill="${fill}" stroke="${border}" stroke-width="3" stroke-linejoin="round"/>`;
}
function thoughtTrail(body, bodyCenter, tip, fill, border, dreaming) {
  const tipVector = subtract(tip, bodyCenter);
  const tipDistance = Math.hypot(tipVector.x, tipVector.y);
  const geometry = tailGeometryForPolygon(body, bodyCenter, {
    x: tipVector.x / tipDistance,
    y: tipVector.y / tipDistance
  }, 0, tip);
  const center = {
    x: (geometry.base[0].x + geometry.base[1].x) / 2,
    y: (geometry.base[0].y + geometry.base[1].y) / 2
  };
  return (dreaming ? [
    {
      ratio: .45,
      radius: 7
    },
    {
      ratio: .78,
      radius: 4.5
    },
    {
      ratio: 1,
      radius: 3
    }
  ] : [{
    ratio: .5,
    radius: 5
  }, {
    ratio: .82,
    radius: 3.5
  }]).map(({ ratio, radius }) => {
    return `<circle cx="${center.x + (geometry.tip.x - center.x) * ratio}" cy="${center.y + (geometry.tip.y - center.y) * ratio}" r="${radius}" fill="${fill}" stroke="${border}" stroke-width="2"/>`;
  }).join("");
}
function burstBodyPoints(width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  return Array.from({ length: 28 }, (_, index) => {
    const radians = index * Math.PI * 2 / 28 - Math.PI / 2;
    const outer = index % 2 === 0;
    const radiusX = outer ? width / 2 - 6 : width / 2 - 22;
    const radiusY = outer ? height / 2 - 6 : height / 2 - 22;
    return {
      x: centerX + Math.cos(radians) * radiusX,
      y: centerY + Math.sin(radians) * radiusY
    };
  });
}
function wavyBodyPoints(width, height) {
  const left = 24;
  const top = 24;
  const right = width - 24;
  const bottom = height - 24;
  const steps = 20;
  const horizontal = Array.from({ length: 21 }, (_, index) => {
    const ratio = index / steps;
    return {
      ratio,
      wave: Math.sin(ratio * Math.PI * 8) * 4
    };
  });
  const vertical = Array.from({ length: 9 }, (_, index) => {
    const ratio = (index + 1) / 10;
    return {
      ratio,
      wave: Math.sin(ratio * Math.PI * 4) * 4
    };
  });
  return [
    ...horizontal.map(({ ratio, wave }) => ({
      x: left + ratio * (right - left),
      y: top + wave
    })),
    ...vertical.map(({ ratio, wave }) => ({
      x: right + wave,
      y: top + ratio * (bottom - top)
    })),
    ...[...horizontal].reverse().map(({ ratio, wave }) => ({
      x: left + ratio * (right - left),
      y: bottom + wave
    })),
    ...[...vertical].reverse().map(({ ratio, wave }) => ({
      x: left + wave,
      y: top + ratio * (bottom - top)
    }))
  ];
}
function transformReferenceBody(style, width, height) {
  if (style === "YELLING") return burstBodyPoints(width, height);
  if (style === "WAVY") return wavyBodyPoints(width, height);
  return roundedRectanglePoints(width, height);
}
function bubbleBodyCenterOffset(input) {
  const minimumSize = bubbleBodyMinimumSize(input.style);
  const width = Math.max(requireDimension(input.width, 220), minimumSize.width);
  const height = Math.max(requireDimension(input.height, 112), minimumSize.height);
  const direction = normalizeDirection(input.tailDirection);
  if (direction === null) throw new TypeError("Bubble body center offset requires a tail direction.");
  const tailLength = normalizeSvgTailLength(input.tailLength ?? svgDefaultTailLength);
  const offset = normalizeSvgOffset(input.offset);
  const center = {
    x: width / 2,
    y: height / 2
  };
  const transformed = transformedBodyGeometry(transformReferenceBody(input.style, width, height), width, height, direction, tailLength, offset);
  return Object.freeze({
    x: transformed.bodyCenter.x - center.x,
    y: transformed.bodyCenter.y - center.y
  });
}
function renderBody(style, width, height, direction, fill, border, tailLength, offset) {
  const rounded = roundedRectanglePoints(width, height);
  const transformWithoutTail = (body) => {
    if (direction === null) return body;
    return transformedBodyGeometry(body, width, height, direction, tailLength, offset).body;
  };
  const withTail = (body, extra = "") => {
    if (direction === null) return bodyPath(body, fill, border, extra);
    const transformed = transformedBodyGeometry(body, width, height, direction, tailLength, offset);
    return unionBodyAndTail(transformed.body, transformed.bodyCenter, transformed.tip, fill, border, extra);
  };
  switch (style) {
    case "NO_BUBBLE": return "";
    case "THINKING":
    case "DREAMING": {
      if (direction === null) return cloudBody(width, height, fill, border);
      const transformed = transformedBodyGeometry(rounded, width, height, direction, tailLength, offset);
      const scale = offset.scalePercent / 100;
      const center = {
        x: width / 2,
        y: height / 2
      };
      const translateX = transformed.bodyCenter.x - center.x * scale;
      const translateY = transformed.bodyCenter.y - center.y * scale;
      return `${thoughtTrail(transformed.body, transformed.bodyCenter, transformed.tip, fill, border, style === "DREAMING")}<g transform="translate(${translateX} ${translateY}) scale(${scale})">${cloudBody(width, height, fill, border)}</g>`;
    }
    case "YELLING": return withTail(burstBodyPoints(width, height));
    case "WAVY": return withTail(wavyBodyPoints(width, height));
    case "WHISPERING": return withTail(rounded, "stroke-dasharray=\"5 5\"");
    case "ANNOUNCEMENT": {
      const frame = roundedRectanglePoints(width, height, 13, 30);
      const placedFrame = direction === null ? frame : (() => {
        const { bodyCenter } = transformedBodyGeometry(rounded, width, height, direction, tailLength, offset);
        const center = {
          x: width / 2,
          y: height / 2
        };
        const scale = offset.scalePercent / 100;
        return frame.map((point) => transformPoint(point, center, bodyCenter, scale));
      })();
      return `${withTail(rounded)}<path d="${polygonPath(placedFrame)}" fill="none" stroke="${border}" stroke-width="1.5" stroke-linejoin="round" data-bubble-inner-frame="true"/>`;
    }
    case "NARRATION": return bodyPath(transformWithoutTail(rounded), fill, border);
    case "OFF_PANEL": return withTail(rounded);
    case "NORMAL": return withTail(rounded);
  }
}
/**
* Renders the canonical Bubble body preview as a standalone SVG document.
* The function is pure so documentation and runtime adapters can share it.
*/
function renderBubbleSvg(input) {
  if (!bubbleVisualStyles.includes(input.style)) throw new TypeError(`Unsupported Bubble visual style: ${String(input.style)}`);
  if (!Array.isArray(input.lines) || input.lines.some((line) => typeof line !== "string")) throw new TypeError("lines must be an array of strings.");
  const requestedWidth = requireDimension(input.width, 220);
  const requestedHeight = requireDimension(input.height, 112);
  const fontSize = requireDimension(input.fontSize, 15);
  const direction = normalizeDirection(input.tailDirection);
  const tailLength = normalizeSvgTailLength(input.tailLength ?? svgDefaultTailLength);
  const offset = input.offset === void 0 ? svgDefaultOffset : normalizeSvgOffset(input.offset);
  const shapeTransition = input.shapeTransition;
  if (shapeTransition !== void 0) {
    if (!bubbleVisualStyles.includes(shapeTransition.from) || !bubbleVisualStyles.includes(shapeTransition.to) || !Number.isFinite(shapeTransition.progress) || shapeTransition.progress < 0 || shapeTransition.progress > 1) throw new TypeError("Bubble shape transition is invalid.");
  }
  const minimumSize = bubbleBodyMinimumSize(input.style, ...shapeTransition === void 0 ? [] : [shapeTransition.from, shapeTransition.to]);
  const width = Math.max(requestedWidth, minimumSize.width);
  const height = Math.max(requestedHeight, minimumSize.height);
  const fill = input.fillColor ?? "#fff4cc";
  const border = input.borderColor ?? "#6f5b45";
  const textColor = input.textColor ?? "#25283a";
  const fontFamily = input.fontFamily ?? "Noto Sans JP, sans-serif";
  const lineHeight = fontSize * 1.35;
  const firstBaseline = height / 2 - (input.lines.length - 1) * lineHeight / 2 + fontSize * .35;
  const textScale = direction === null ? 1 : offset.scalePercent / 100;
  const textCenter = direction === null ? {
    x: width / 2,
    y: height / 2
  } : transformedBodyGeometry(roundedRectanglePoints(width, height), width, height, direction, tailLength, offset).bodyCenter;
  const text = input.lines.map((line, index) => `<text x="${textCenter.x}" y="${textCenter.y + (firstBaseline + index * lineHeight - height / 2) * textScale}" text-anchor="middle" fill="${escapeXml$2(textColor)}" font-family="${escapeXml$2(fontFamily)}" font-size="${fontSize * textScale}">${escapeXml$2(line)}</text>`).join("");
  const body = shapeTransition === void 0 ? renderBody(input.style, width, height, direction, fill, border, tailLength, offset) : `<g opacity="${(1 - shapeTransition.progress).toFixed(4)}">${renderBody(shapeTransition.from, width, height, direction, fill, border, tailLength, offset)}</g><g opacity="${shapeTransition.progress.toFixed(4)}">${renderBody(shapeTransition.to, width, height, direction, fill, border, tailLength, offset)}</g>`;
  const title = escapeXml$2(input.title ?? `${input.style} bubble`);
  const transitionAttributes = shapeTransition === void 0 ? "" : ` data-bubble-shape-transition-from="${shapeTransition.from}" data-bubble-shape-transition-to="${shapeTransition.to}" data-bubble-shape-transition-progress="${shapeTransition.progress.toFixed(4)}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" data-bubble-renderer="canonical" data-bubble-style="${input.style}" data-bubble-body-width="${width}" data-bubble-body-height="${height}"${transitionAttributes}><title>${title}</title>${body}${text}</svg>`;
}
//#endregion
//#region node_modules/.pnpm/@cto.af+unicode-trie-runtime@3.2.9/node_modules/@cto.af/unicode-trie-runtime/constants.js
var LSCP_INDEX_2_OFFSET = 2048;
var INDEX_1_OFFSET = 2112;
//#endregion
//#region node_modules/.pnpm/fflate@0.8.3/node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  0,
  0,
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  0,
  0
]);
var clim = new u8([
  16,
  17,
  18,
  0,
  8,
  7,
  9,
  6,
  10,
  5,
  11,
  4,
  12,
  3,
  13,
  2,
  14,
  1,
  15
]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) b[i] = start += 1 << eb[i - 1];
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) for (var j = b[i]; j < b[i + 1]; ++j) r[j] = j - b[i] << 5 | i;
  return {
    b,
    r
  };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
_b.r;
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
  var x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) if (cd[i]) ++l[cd[i] - 1];
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) le[i] = le[i - 1] + l[i - 1] << 1;
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) if (cd[i]) {
      var sv = i << 4 | cd[i];
      var r_1 = mb - cd[i];
      var v = le[cd[i] - 1]++ << r_1;
      for (var m = v | (1 << r_1) - 1; v <= m; ++v) co[rev[v] >> rvb] = sv;
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) if (cd[i]) co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
  }
  return co;
});
var flt = new u8(288);
for (var i = 0; i < 144; ++i) flt[i] = 8;
for (var i = 144; i < 256; ++i) flt[i] = 9;
for (var i = 256; i < 280; ++i) flt[i] = 7;
for (var i = 280; i < 288; ++i) flt[i] = 8;
var fdt = new u8(32);
for (var i = 0; i < 32; ++i) fdt[i] = 5;
var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) if (a[i] > m) m = a[i];
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0) s = 0;
  if (e == null || e > v.length) e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace) Error.captureStackTrace(e, err);
  if (!nt) throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l) return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf) buf = new u8(sl * 3);
  var cbuf = function(l) {
    var bl = buf.length;
    if (l > bl) {
      var nbuf = new u8(Math.max(bl * 2, l));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt) err(0);
          break;
        }
        if (resize) cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1) lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) clt[clim[i]] = bits(dat, pos + i * 3, 7);
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl;) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) ldt[i++] = s;
          else {
            var c = 0, n = 0;
            if (s == 16) n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17) n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18) n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--) ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else err(1);
      if (pos > tbts) {
        if (noSt) err(0);
        break;
      }
    }
    if (resize) cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (;; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt) err(0);
        break;
      }
      if (!c) err(2);
      if (sym < 256) buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d) err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt) err(0);
          break;
        }
        if (resize) cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0) err(3);
          for (; bt < dend; ++bt) buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt) buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm) final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /*#__PURE__*/ new u8(0);
var gzs = function(d) {
  if (d[0] != 31 || d[1] != 139 || d[2] != 8) err(6, "invalid gzip data");
  var flg = d[3];
  var st = 10;
  if (flg & 4) st += (d[10] | d[11] << 8) + 2;
  for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++]);
  return st + (flg & 2);
};
var gzl = function(d) {
  var l = d.length;
  return (d[l - 4] | d[l - 3] << 8 | d[l - 2] << 16 | d[l - 1] << 24) >>> 0;
};
function gunzipSync(data, opts) {
  var st = gzs(data);
  if (st + 8 > data.length) err(6, "invalid gzip data");
  return inflt(data.subarray(st, -8), { i: 2 }, opts && opts.out || new u8(gzl(data)), opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /*#__PURE__*/ new TextDecoder();
try {
  td.decode(et, { stream: true });
} catch (e) {}
//#endregion
//#region node_modules/.pnpm/@cto.af+unicode-trie-runtime@3.2.9/node_modules/@cto.af/unicode-trie-runtime/swap.js
var isBigEndian = new Uint8Array(new Uint32Array([305419896]).buffer)[0] === 18;
/**
* Exported for testing
* @param {Uint8Array} array
* @private
*/
function swap32(array) {
  const len = array.length;
  for (let i = 0; i < len; i += 4) [array[i], array[i + 1], array[i + 2], array[i + 3]] = [
    array[i + 3],
    array[i + 2],
    array[i + 1],
    array[i]
  ];
}
/**
* No-op.
*
* @param {Uint8Array} _array Ingored
* @private
*/
function noOp(_array) {}
var swap32LE = isBigEndian ? swap32 : noOp;
//#endregion
//#region node_modules/.pnpm/@cto.af+unicode-trie-runtime@3.2.9/node_modules/@cto.af/unicode-trie-runtime/index.js
var DECODER = new TextDecoder();
/**
* @typedef {object} TrieValues
* @prop {Int32Array} data
* @prop {number} highStart
* @prop {number} errorValue
* @prop {string[]} [values]
*/
var UnicodeTrie = class UnicodeTrie {
  /**
  * Creates a trie, either from compressed data or pre-parsed values.
  *
  * @param {Uint8Array|TrieValues} data
  */
  constructor(data) {
    if (data instanceof Uint8Array) {
      let uncompressedLength = 0;
      const view = new DataView(data.buffer);
      this.highStart = view.getUint32(0, true);
      this.errorValue = view.getUint32(4, true);
      uncompressedLength = view.getUint32(8, true);
      if (uncompressedLength !== 4294967295) throw new Error("Trie created with old version of @cto.af/unicode-trie.");
      uncompressedLength = view.getUint32(12, true);
      if (16 + uncompressedLength > data.byteLength) throw new RangeError("Invalid input length");
      const values = data.subarray(16 + uncompressedLength);
      /**
      * @type{string[]}
      */
      this.values = values.length ? JSON.parse(DECODER.decode(gunzipSync(values))) : [];
      data = gunzipSync(data.subarray(16, 16 + uncompressedLength));
      swap32LE(data);
      /**
      * @type {Int32Array}
      */
      this.data = new Int32Array(data.buffer);
    } else ({data: this.data, highStart: this.highStart, errorValue: this.errorValue, values: this.values = []} = data);
  }
  /**
  * Creates a trie from a base64-encoded string.
  * @param {string} base64 The base64-encoded trie to initialize.
  * @returns {UnicodeTrie} The decoded Unicode trie.
  */
  static fromBase64(base64) {
    return new UnicodeTrie(new Uint8Array(atob(base64).split("").map((c) => c.charCodeAt(0))));
  }
  /**
  * Get the value associated with a codepoint, or the default value, or the
  * error value if codePoint is out of range.
  *
  * @param {number} codePoint
  * @returns {number}
  */
  get(codePoint) {
    let val = this.errorValue;
    if (codePoint < 0 || codePoint > 1114111) val = this.errorValue;
    else if (codePoint < 55296 || codePoint > 56319 && codePoint <= 65535) {
      const index = (this.data[codePoint >> 5] << 2) + (codePoint & 31);
      val = this.data[index];
    } else if (codePoint <= 65535) {
      const index = (this.data[LSCP_INDEX_2_OFFSET + (codePoint - 55296 >> 5)] << 2) + (codePoint & 31);
      val = this.data[index];
    } else if (codePoint < this.highStart) {
      let index = this.data[INDEX_1_OFFSET - 32 + (codePoint >> 11)];
      index = this.data[index + (codePoint >> 5 & 63)];
      index = (index << 2) + (codePoint & 31);
      val = this.data[index];
    } else val = this.data[this.data.length - 4];
    return val;
  }
  /**
  * Get the value associated with the codePoint, stringified if possible.
  *
  * @param {number} codePoint
  * @returns {number|string}
  */
  getString(codePoint) {
    const val = this.get(codePoint);
    return this.values[val] ?? val;
  }
};
//#endregion
//#region node_modules/.pnpm/@cto.af+linebreak@4.0.3/node_modules/@cto.af/linebreak/lib/LineBreak.js
var LineBreak = UnicodeTrie.fromBase64(`AAgOAAEAAAD/////nRQAAB+LCAC4xcFoAgPtnQnwlkUdx1+URLxABcUUghTEEK8Cmwp0LJAa
   MRrFbBSPSXHSAUYNdFQoBWMKyQrUCo/EyMIjD3TIAxXJM5NBHBm0RDSPzDOVdAz7/nB/07bt
   s8/e+/zhfef9zD7HPs/e129/u8/yzVutVWANeBl079xq9QJ9wUCwDxjqYQ4DI8BoMBYcBY4D
   48FEw3NTwDTp/BxwAZgJLgaXgCvAAnADuA3cDe4Hj0rPLQerwLPgJfAaeBe8Az4EnT/Ram0D
   eoBdwe5gENgX0DsOhHkQGAlGgTHgaHACGA8mgilgGpgBLgJzweVgPlgIbgF3iPOl4BGwAqwG
   a8Er4C2wDnwEumzRanUDPUFv0B8MBgeAL4BDwNfAN8C3wIngO+A0cCZowd/nwrwA/Eic/wzm
   L8EMHM+HuRDcDP4g7t8Hk3hYmI8BCv+TwvwLTOZvglfBawKyQ7wrjv8Ns1OXVqsroPNuwuwJ
   szfoL86JwTgeIp3HYJj0vhE4Hg3GgnHgZMDhnYDjyWCqZP9CHM8Gc8S1y2BeBa4FvweLxPN3
   wVwq7Dwirp0KVuB4NVgLXgSvg/fA+6C1Jf6gO+gF+oI9wQa3YQ4FwwDlwREwR4Mj+L6GY3Dv
   eMN9OY7JPAV2Jwn7Z8E8F0wHs8AcMA9cA64Dt4I7wT3gQfA4eAI8DdaKd7wizLdgvg86dUWa
   g+1BL0D3+sIcAAaLc5X9xfUDYR4EDlUYJR2PAUeCY8FJ4DRwJjgXTAezwBwwD1wDrgO3gjuF
   G/fAfBA8Js5XwnwaPF/htypeFfbfhvm+w7OdtkL6Axe3thP2uSzuhPM+YICA6tZ9YA4FwwGV
   55F0XTBGOlY5GhwHxoOJYAqYBn4AfiyOLwVXgvnSc9dKxzeC28XxEoNbbdq0iQvXEe24aNOm
   TZs2bdq0aePC0ob55yFhPg5IHlI3Rl4Je8+I/vALMN+T7v3DMN5+B/c+BJ23hhwQ0LUeMM+G
   OQrshuM9AMkJ94b5WfBF8GVwKPg6+CYgOc7xME8BLFsiJuH8LPA9MFO8/yJhMnNxfjm4AlwJ
   rgK/AleD+e177Xvte+177XvR7/0O3ARuBSQzLcmd8ENJSoe/TZsmE9qfvR9l7FHwhNL3c+Ep
   zbPP4trz4FXwT/AB2Gyb/7WzJc67g16gLxgIBgOasxkCcxgoXf/c2+1jDu7ean0fLDbwDvjc
   9pi7Aj8H8r1V4vxlmLvtgLlCMBesBNvs+PG9g2GeBxaB5aB7j1brOczh9UN8nAiuBs8BGg8c
   BqgP/xOqI2n+VvAQzile53T6L6NwLts5G+eLwSpxfT3M4dtiTg0sAevB8O1wDuT35GZJA9yX
   461NmzZtNiXWow6cTrpKaCNGU3uhtPNjcW0cOEFq28fjeAI4HUwWz8iQbIvsrYM5VTw3HSbp
   Fs2EebG4dpnGPYL0hM4n3SfcXyDsLhTmzTBvA3eI86VKn6MK0lshfao/kt9x/pjk7ydFW7lG
   vIt0rl4W99+EuQ58BEh3jP3bBW1oVxHObjjeCfQB7B7bG8DXYJ5OelYwvwS+Ath9fuY0KT4O
   E88dKcxjYJIs8NswT5WeVSG/k/0zYOcccL54nuLvh+QHmD8V5jJA8fILnP8Lz10N87eAdMRu
   grlY9Bfo/AGYfwYrxPl9eOdqHK8l/+D47zDfFv76AOZmyFeTcLwVzB1AL9AXDAT7gSFgGBgB
   yH87ks4ZjseK86+CcdQ+a8JI90/GvQniPtufjPOp4vkLYc4Gc8Hl4NfgesP7Fin3OE3uwvVl
   4BGwQrKzGsd/BS+C18Hb4APhdif0J7sC1unbHsf83C7SMd3vh/O9yC4YCoaBQ8Aoyd4YHB8J
   jgUngVMBlQ8qG2dI9nScg/sXgJngYsnupTi+EvxG+DMnXI7UuCZuNPjn9pqwboxQOeXwc50Q
   gyUinh8wxPfDFfeW4/qqAvmmaVDb6PvsGiX+XvLM2/1Qb76xEZeLGOlEdTC1i+tEnNMx1Z8f
   ivPOGJtvDXYEJNfw9eeueL4uHLvDziBA/Rb5+gG4Rvq0n5feQTKJXHp8rlBfaiT8R7KcKnnV
   4Yb42BQ4wjL9joG9E8Apjul9uBL3TS+/kxC+74LzGpAvTHl7BvznUyYuwnM05iGoLM/F+Tzl
   XdyHqStbZM4S5/PxjoXgJvEuWqvAdkmuKIeL6hV5TET9e6r/qsJPazHIvBfveQgsF248BXMF
   1YcOcXGERXv4AslIPeNXhuL3TVFnroO5HmwB2WtT8j21Mdsa/NMT93qDDevFkJ79Fbsb1s7g
   2hDLMFE/cZh434iAeKD3jDY8T/fHGu5TuMfVuH+y8KeOCeJZPp+cIU1JD4fcmiq5NVvIIaqe
   oXJyIezPBpeAK8AC8Xxvi/5YXd1+A951C6C1R4uFeTdMurdMmC78Cc+sBM+ANdLzNF/xBlgH
   PpKud8G8xXagB9gZ9AF0fQ+Yg8QxcQCOh4rz4TBHimM5TQ/HNT5egHDQfdZFOkrcI/nEcTge
   Dyh+JsKcIt41TZgzYM5S3j9H8gsxD+dXSe4x10rXrleeyc2iwu6XhsJ/F8WBqMeJ/ysfBpaJ
   PNKReXzzThvYDKd1YFn0hscg/tsALZ21ec4GsTS0hWLZou4kDX9oaELHdI1EeiT24ntUtVGX
   g0yq7igpbCD7BL2HIXfl89RQWCgMHJ7ckPuUlpj63XBO8Y9pyE2aTf2nK5NQC4hWvuvoKfIl
   lXkqGwzlz50EfMx1BOVhztP8HNvdWXlWhp6Xz8ndlOWN/V6K0u43Dc4fch7gc9s4U/OU/Azn
   vZLkKrdNheqTKnzeVxff/FOvc19D/dW9SzZjkuKdMfPmxlrn5Ix3mzzWBKhs9NL4l9rxqj5J
   06HwcD6W8zQf01iDzLrfLhmpc1vNVza/qvGXnP7UZ2PUcZlLnHOcksk0KZ+nyGe2412KW13c
   p65rOQ3qwmCyo8afzi7bsY2PmPV4yfYqZl7qKO1F6nhyreNs6rvY+S9XnOjaai7TssxAHqfn
   8GuV/9XrVfZi5PVcZaXK367u636hfuP8bCtL8u3np+6vURhK9BObUPZjxm+scZ0810DkrFfV
   8uY6zgotWy5ygSq35DJYlyZqedWVX5s2UTeeqQqT6pZr+vJ4QRc/fF1uj6rCZYprU1hypG/d
   sRznpnS1Sd+6dKzLa3X5wzZ9dfWEa5/Mtfzq0qRE+vqWX10eqErfkL6tOubxLb8s1zG54RLO
   nPWzb/3pkl9z1J8ufcQqP9fl9ao6w9Re6cKsS7u6a3Xto2s81NWvpjxqW/5s5IEpxpncTtr2
   4XPWpbHGWa79Idv0NMWZKR5i1aemn+38oxwum2dKpm+M9jJm+pr6RrHSV9eH9dXnyN0XijEO
   i5GedX16VzluqvZXHr9UpY1P/9a1zSs176m2kbb+NY13qvKLjYwqtP1V/eLT//5kQ1B/1G8I
   eZ/LfA3LgUzxw8dVcZYiLuvcjB33IX7wybe6NKM+gox8jfRq+JjSi87l+ViGrut0buvaqdhy
   QPKj3MawSbqApBfLZoi81kcuXqV3XXc9VHbeBH0L+nF5N7W/Nm2NnBer+rasD9bEute1flTD
   lst9Ux1vK8PWjZFD+x27Fma3wvQujG/fMFQ/0iX/hD7f9PClnr9OHX8+Mh65PTS1Iyn9UULX
   M/b8vq9uKf9ID7KkjkvOtOe+om/8cxvu6meXubpY+jcuc0Wx3TeNBVOH33e+LKQ+rZM55pQd
   cNz3kc4578rygFhy7Fj1H4872f88FpD1hNV1Iy76tbnr35Dyn1v3yCT3KhEnJdpnG1mui46u
   ryzBNNaiH5eH0HFfbPlWqvouVX0ZKjdW65S68XQqfWC1nJSUO8eoj0OfjxGGUjI1V/erZGIh
   P507n8qIa7z1tXinLK/sZwnb/7TS7+drNtj43+Y9sttN00121aMOnR+wTb/UuIZ/d4FrfydV
   PSOXCRmf+jfl/E9KuUMpuVPMfnKMdQIucze69X6m8YPvngAl9yOwqWNt5Wsu+hSp9xRoytr0
   UN3tunhPHQ91brDsoqqOZSivyed7iDzXX8p/JJ8le2QSA4C8lwntkcP7bvGxfC7bJfaUIDd5
   j7CqsiCv/dYh+4HcIbkTYdpLgOWwbNdk31R/k/tqnKpy2oGB43o1H9js0cPhk/ebUfegsZVT
   h8pW5D2aVNQ9nFzQPStf4+MQN4jYfZ4Q+TDndzUNTfqAVfs7uazFtc03KfaP0u3LZYvP877u
   ++6zpf5SuOfiJ9+w6PylXtPdZ1Pdx80UZ1VxoYahLl/Y7tflUxbqwhyr7OjioCpuTOexymmM
   99vGWe5960LdoT5PrDlkNn39yrIdFzdTxKkqa0o9n5NyfjbFL6T9i03O9jTEjVT9CZt61qWe
   DAmTbX1rkw4ubWysflyu/Uh19Utdv8QUb/wevs/vlN3YK0J95hvGWP26FP0CXV0ix6XOfmi8
   lNw7tlSc284PqXnZlKf5umpfVx7Ue3K5q4onnT9079H5h8ubyX5VGZHfIVOiPynLz2RkPSTV
   /2p/0NZM2Ufw7dPm3tveJp46kn5prDC7miXDUCoOc7QdKeU9KeZZbNZTsw6ZKjPna6G6jLZ6
   v6Y9S0rqHMbaN8j3flUbVIdpnonTleaP+JsiapunntfVOer7WUdXNw+jCyvNYxE6P9Ix+7Mu
   TCa3uM3mb9JUmfLe1q59N19yulXnD5dfU/yRyn/8vR2Cr9H8JB/btsm29undfCw/56tbVmVX
   d53nXtV0+Iw4rjNTk8udOvdtwl13j1B1YuT5b04HMpsW/7HCr8t/dF0Of846J3W9HPtdNnUf
   x7UvpdsiV1mJjawiFLWODEm73G1mLF1J2/GB7X7UtvqhJeeTfPc4T7mPtLpuWqWJ66malIZV
   Oq6uerCp9Oh1dlzCzrpIudKf92/hsZbP+hIbHa0Q/fQYe/v4lmd5T5s6veq6vYViyzJT69KV
   2t/FlN451zKFrm3i9U0264J0fQOX9U5Vfe6S+xPRL8VaHJe8rK69qpNJqe92jX81XX3X2fr8
   XPaHsq1PdPWWa12Sag1GaXmwT98pZ/2vy8+h7e8gsHdGcrvn+ou5l5j6K7GfmPobXJiY4xLb
   d9C3GKnM2H7Xkd7j+z1I03X5ftWxjd9KwDLy0mNPV/fUtSCh4wyeF5DXS8nzWnSd9Jqrfrye
   UWfa3NP1O131E9TnTDItvs/rn9Qwm9y3lS/yuiSdDK2J32LmH61l4/l7DpMcFl0cy/HpKvNU
   5Z6yuzmgsPj4PZX78jydfMzx1BFk7Gr61smlU9yXf7w+UL7Pa5Fc9pe3lTntI+YJYvTvQ9Y9
   x9gbNOU66lxyYJPsuqPtBRpjvW7uX6n9Y3LpfMUe8+fYy6sJ+99x2QyVR1TJrEvlz9Lxmzq8
   Kct+jO8mpnIrV35pYv3rso+6j2w1RzkxpWeOslpV38Xey7lJ7XVVnDdFVyDn2o2m7A1s871r
   U3+hbp661LfjbL6l6vL9O5v5uiqdcd/9mG3sVrlrktHl3m+5Ln46Qply/f51rDq2afV3U92P
   9Z2CVPu71+kExf4uhm265Mpfcrjl9S+p/WGjb9FEeYmrHlhsXTLb772b2v3U8bKvoAk6VaQ3
   ZdqvWf2FytNd9g1W/c57VNf9+JuMuXT+ZJ1tnZ6T7U+un1PXpSm/BxKiZ+b6nUC5P+bybdoU
   3wWR9zP1WcOrrtc06dG7rA9gf6lzCCVlQKl1cKvW16r7MjdxPqHue3m55l5M6yRy1q8p6i+d
   GzbfR5Dtqeeu1D2rulVlp+67ulXfzlDPqS/AP52us+kb5aoetdp226wrqOtHuvxc9InlsMrX
   5HCkgvtULt80VtPB5tvHlLbU51R1leQ+nW0ftknjClM7Ktf7Pt9n161FKfULHbeU/P5brO/5
   8PeveZ2l+s31OpmmizxP5z/VrssvNP7Vb9XbUGr+LWSdWKr4c/lemct7U/1KfJcs5nfiXNcz
   Va3lCf2OXi75c+gaSd/4SyH/pmds+8G2fWCbvmwMeZapf6v2g9hU16vF7l/65K8cc6uh7bIs
   W8jdLyyxp4BPPOru6+Qx8rd8beIyhew8xjoMtU8l90dcyldseUOJPpPLevpc7ZnvL8f4oaRO
   ad34WVeefPYVSdG+27T7vPdESj0VV5leyvXoufQvffKZTpZmGy+27UNKfYCc5dWmj2fbp44Z
   P6G/WN9X1cl8beoieS7ad7+PGP14nz1ATO1q3Xx2jHnpWO1xR1uPovumYQndrFD9uyrdvpD4
   b9L8Yaz9wxl5bbVu/XlT9j2X/Rr6Hl7brYPd0V1jM5bOk+84oUn7xpeeH7IhVJ7j25+IrU9s
   ig+XOi7lGMtGj9pGB903/kuMQVPuORpjv7+c35AvvYYkNO1CviFvU4/HkF+qe2ZTG+VTn1bt
   fV7y5/PtqNR76oeuy4zlH3n/9ND3qPuxu7xb3cuj7heahiXq4ljrC1R5vm5M39HGFz7yzRLr
   k1PoMMfcPzeGvDPWPssxw6Rzo8QcXmp3XGSSHX2/Et08k67f5dtmuupKN2FvMpOsKObeDnVx
   k3ofp1h6VrFIVVdV7T2fYm9013l7k/5rbNlKaBuXso7LLV+K1d67uuWiJ19ShhcjvUP97FsO
   Q+V7pdfDpy5rtv2qEPkU7XFY0v3Q+Oc8FpqHdHV9Xf415XFbPTPfPk7qNWsufow9vkqlz6v+
   eA4udH9l3XxtiA5ZyN5XpvxSNzdetRdQlWnKjzbP695Xt9+WTz/bJk5y6tDVlYHUe0Crv9Bv
   vMf+bnzq79DHenfs/ZD3y4TO7b0S7vPM8Z5yL2mTG1XXKcyMLh5093OzvwbVfzr/1hHDby7u
   ufhH5z/Vrm1YZPsheUtn2pQh+RnfMmCqy3PN7aSeN0oRtrp8m6oONOXflHVfrnj0ccdU1lVS
   yYu7Ssjz96ZwxEgz13rX1c3Y+Sp2vJve7eN+zP3nYsojYunAhMq1cs2vM1X9J99+Q2g+d+1z
   5OznpXJD1zcKcc/U33KN39TzgCnr4lz95Fz1cW79kxT6SDF00UruT5ZDZ8Xl9x83MV0I0CwB
   AB+LCAC4xcFoAgMdjksWhCAMBO/CelYzJ4gMCqiI4t/n/a9hyk29JN3p5DL7bj7GTQrbKypR
   dDVVywyhZCz4xkUhnSIj5EExoFoQisIfbICE2WJOoAESSK7wecCscDJSxRXMbBAlfLCyIbTh
   T8tr5/YikvVFSYq3dURbKo/gf+Q3zBCELycCXW/uB2mPjCb8AAAA`);
/**
* @type {Record<string, number>}
*/
var names$1 = Object.fromEntries(LineBreak.values.map((v, i) => [v, i]));
var { values: values$1 } = LineBreak;
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/typeof.js
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
    return typeof o;
  } : function(o) {
    return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
  }, _typeof(o);
}
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/toPrimitive.js
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/toPropertyKey.js
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/defineProperty.js
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : e[r] = t, e;
}
//#endregion
//#region node_modules/.pnpm/@cto.af+linebreak@4.0.3/node_modules/@cto.af/linebreak/lib/state.js
var _Symbol$for;
var _Symbol$for2;
var { AI, AL: AL$1, CJ, CM: CM$1, NS: NS$1, SA, SG, SP: SP$1, XX } = names$1;
/**
* Convert a class number to a string, if possible.
*
* @param {number?} cls
*/
function classText(cls) {
  switch (cls) {
    case null: return null;
    case -1: return "sot";
    case -2: return "eot";
    default: return values$1[cls];
  }
}
/**
* LB1: Assign a line breaking class to each code point of the input. Resolve
* AI, CB, CJ, SA, SG, and XX into other line breaking classes depending on
* criteria outside the scope of this algorithm.
*
* @param {number} cls
* @param {string} char
* @returns {number}
*/
function resolve(cls, char) {
  switch (cls) {
    case AI:
    case SG:
    case XX: return AL$1;
    case SA: return /^[\p{gc=Mn}\p{gc=Mc}]$/u.test(char) ? CM$1 : AL$1;
    case CJ: return NS$1;
  }
  return cls;
}
_Symbol$for = Symbol.for("nodejs.util.inspect.custom");
/**
* Information about a particular input character.
*/
var BreakerChar = class {
  /**
  * @param {number} cls
  * @param {number} cp
  * @param {string} char
  * @param {number} len
  */
  constructor(cls, cp, char, len) {
    _defineProperty(
      this,
      /**
      * Code point
      */
      "cp",
      -Infinity
    );
    _defineProperty(
      this,
      /**
      * Line breaking class, or `sot` or `eot`.
      */
      "cls",
      -1
    );
    _defineProperty(
      this,
      /**
      * The character.  Might be one or two UTF-16 JS characters.
      */
      "char",
      ""
    );
    _defineProperty(
      this,
      /**
      * The length of the whole string up to and including char, in JS chars.
      */
      "len",
      0
    );
    _defineProperty(
      this,
      /**
      * If true, this is an LB9 CM or ZWJ that is treated as coalesced into
      * the previous code point.
      */
      "ignored",
      false
    );
    this.cls = cls;
    this.cp = cp;
    this.char = char;
    this.len = len;
  }
  /**
  * Debug helper.
  *
  * @param {number} _depth
  * @param {import('util').InspectOptionsStylized} _inspectOptions
  * @param {(x: any) => string} _inspect
  * @returns
  */
  [_Symbol$for](_depth, _inspectOptions, _inspect) {
    return `${classText(this.cls)}(${this.cp.toString(16).padStart(4, "0")}:${JSON.stringify(this.char)})${this.ignored ? "Ig" : ""}`;
  }
};
_Symbol$for2 = Symbol.for("nodejs.util.inspect.custom");
/**
* @private
*/
var BreakerState = class {
  /**
  * @param {string} str
  */
  constructor(str) {
    _defineProperty(this, "str", "");
    _defineProperty(this, "len", 0);
    _defineProperty(this, "prevChunk", 0);
    _defineProperty(this, "prev", new BreakerChar(-1, -Infinity, "", 0));
    _defineProperty(this, "cur", new BreakerChar(-1, -Infinity, "", 0));
    _defineProperty(this, "next", new BreakerChar(-1, -Infinity, "", 0));
    _defineProperty(this, "LB8", false);
    _defineProperty(this, "spaces", false);
    _defineProperty(this, "RI", 0);
    _defineProperty(
      this,
      /**
      * Extra properties, to be copied to Break when created.
      *
      * @type {Record<string,any>=}
      */
      "props",
      void 0
    );
    _defineProperty(
      this,
      /**
      * Extra state information, for use by tailoring subclasses.
      *
      * @type {Record<string,any>}
      */
      "extra",
      {}
    );
    this.str = str;
    this.len = str.length;
  }
  /**
  * Move to the next state.
  *
  * @param {BreakerChar} step
  */
  push(step) {
    if (this.next.ignored) this.cur.len = this.next.len;
    else {
      this.prev = this.cur;
      this.cur = this.next;
    }
    this.next = step;
  }
  pushEnd() {
    this.push(new BreakerChar(-2, Infinity, "", this.next.len));
  }
  /**
  * Iterate over the codepoints in the string, starting at pos.
  *
  * @param {number} pos;
  * @param {boolean} [fwd=true] If true, go forward.  Otherwise reverse.
  */
  *codePoints(pos, fwd = true) {
    if (fwd) while (pos < this.len) if (pos === this.cur.len && this.next.cls >= 0) {
      yield this.next;
      pos += this.next.char.length;
    } else {
      const cp = this.str.codePointAt(pos);
      const char = String.fromCodePoint(cp);
      const cls = LineBreak.get(cp);
      pos += char.length;
      yield new BreakerChar(resolve(cls, char), cp, char, pos);
    }
    else while (pos > 0) if (pos === this.cur.len) {
      yield this.cur;
      pos -= this.cur.char.length;
    } else if (pos === this.prev.len) {
      yield this.prev;
      pos -= this.prev.char.length;
    } else {
      let prev = pos - 1;
      const prevUSV = this.str.charCodeAt(prev);
      if (prevUSV >= 56320 && prevUSV <= 57343) prev--;
      const cp = this.str.codePointAt(prev);
      const char = String.fromCodePoint(cp);
      yield new BreakerChar(resolve(LineBreak.get(cp), char), cp, char, pos);
      pos = prev;
    }
  }
  /**
  * Look ahead in the string to see what the next linebreak class is after zero
  * or more spaces, starting at JS char offset pos.
  *
  * @param {number} pos
  * @returns {number}
  */
  classAfterSpaces(pos) {
    for (const { cls } of this.codePoints(pos)) if (cls !== SP$1) return cls;
    return -2;
  }
  /**
  * Get the character after next.
  *
  * @returns {BreakerChar?}
  */
  afterNext(offset = 1) {
    for (const chr of this.codePoints(this.next.len)) if (--offset <= 0) return chr;
    return null;
  }
  /**
  * Set some extra information in the state that will be passed to
  * the next created Break.
  *
  * @param {string} key
  * @param {any} value
  */
  setProp(key, value) {
    if (!this.props) this.props = {};
    this.props[key] = value;
  }
  /**
  * Debug helper.
  *
  * @param {number} _depth
  * @param {import('util').InspectOptionsStylized} _inspectOptions
  * @param {(x: any) => string} inspect
  * @returns
  */
  [_Symbol$for2](_depth, _inspectOptions, inspect) {
    let pn = `${inspect(this.prev)} => ${inspect(this.cur)} => ${inspect(this.next)}`;
    if (this.LB8) pn += " LB8";
    if (this.spaces) pn += " spaces";
    if (this.RI > 0) pn += ` RI: ${this.RI}`;
    if (this.props) pn += ` ${JSON.stringify(this.props)}`;
    return pn;
  }
};
//#endregion
//#region node_modules/.pnpm/@cto.af+linebreak@4.0.3/node_modules/@cto.af/linebreak/lib/break.js
var Break = class {
  /**
  * @param {number} position
  * @param {boolean} [required=false]
  */
  constructor(position, required = false) {
    _defineProperty(
      this,
      /**
      * If the `string` option is enabled, a slice of the original input.
      *
      * @type {string=}
      */
      "string",
      void 0
    );
    _defineProperty(
      this,
      /**
      * Extra info from plugin rules.
      *
      * @type {Record<string,any>=}
      */
      "props",
      void 0
    );
    /**
    * Offset into input string in JS characters (16bit code units).
    *
    * @type {number}
    */
    this.position = position;
    /**
    * Is this a required break?
    *
    * @type {boolean}
    */
    this.required = required;
  }
};
//#endregion
//#region node_modules/.pnpm/@cto.af+linebreak@4.0.3/node_modules/@cto.af/linebreak/lib/EastAsianWidth.js
var EastAsianWidth = UnicodeTrie.fromBase64(`AAAEAAAAAAD/////wQIAAB+LCAC1xcFoAgPtmj1IHUEQxzd5FiaEkMLSKqQIViEQCEmTjyqk
   SUgR7OySTrHxdVoIYqUg2AgqFhYWFhYidpYqKDaClVZaqJWF2qj/xT1cjjtv772Z3T1uHvzY
   753d2b252ds3+1SpRbAMVkGSrlMo5LNjIfqoB/uEfR2Ao5yy4zb7PgUX4Brcgo6GUi9AF+gG
   r0EPeAc+AN3mM8KvJu6DH0bWb08yeyEneV77rHia/yjbMvEBxJum7mCqzQjSo1beuBWfRFy3
   1fHpR2QJgiAIgiAIgiAIQpoZc45c8HhGd2WJYUyy5oIgCP5oRPhuEQQh7vvPVuAe34q5x1lH
   uJFh15J7HRt9Z7MJ9iKwg1fP72kG4osqz3ynUlNPHjhC2i5/9UypX8DOa6bSa0hfAbsf33zE
   /EPLr7NtOYj4zlTfD+v7dG0r8uzhXM39qEPH9TtBvTNwUXK9dyv0frzE3DSxje8mZ0yNjuz8
   zlT+S6T1OnQh7M5oo+f+Bvk67EGY/OfiPeKfTL5+hr6ZuM13k/cT4R/QC86tMfdZbf4a2Un6
   H9L9OXNIGCoo12yDYdR7mzG+tP8yhjoTpt607tuh/6r7b1VG7yv5ya/OP7iZQXEdYyi9UNel
   WKM83YTQE/f8qftudz9y7G/OdWlXLxTPYRm9cu+ZMutMaYuK2tnjyqpb5jnPa8+xH7n3eJFO
   ivRGbTNC6su3PeHYM0V7OxZ/hUtWLP5ZFfzDmMYQSieU8qj78rF3fMsI+axX5fwWYvw+5t9u
   f0VnNR964yh31bdLOce8qfYb11ndVWeUvibHfCj8tZD2LNZvTRyyW/GfQr1/OM8gob/LcPn8
   If3iVmVT23Iu/69KaxHzOYn6XenTNw1551DW/3V5X7v6c9Tfh7jPX9TrFtqOhjgPttqeW28u
   33192kvqs2vW7w7BeyuJcEoAAB+LCAC1xcFoAgOLVvJT0lGKVIoFANHfAiwJAAAA`);
Object.fromEntries(EastAsianWidth.values.map((v, i) => [v, i]));
var { values } = EastAsianWidth;
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/checkPrivateRedeclaration.js
function _checkPrivateRedeclaration(e, t) {
  if (t.has(e)) throw new TypeError("Cannot initialize the same private elements twice on an object");
}
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/classPrivateMethodInitSpec.js
function _classPrivateMethodInitSpec(e, a) {
  _checkPrivateRedeclaration(e, a), a.add(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/classPrivateFieldInitSpec.js
function _classPrivateFieldInitSpec(e, t, a) {
  _checkPrivateRedeclaration(e, t), t.set(e, a);
}
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/assertClassBrand.js
function _assertClassBrand(e, t, n) {
  if ("function" == typeof e ? e === t : e.has(t)) return arguments.length < 3 ? t : n;
  throw new TypeError("Private element is not present on this object");
}
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/classPrivateFieldSet2.js
function _classPrivateFieldSet2(s, a, r) {
  return s.set(_assertClassBrand(s, a), r), r;
}
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/classPrivateFieldGet2.js
function _classPrivateFieldGet2(s, a) {
  return s.get(_assertClassBrand(s, a));
}
//#endregion
//#region node_modules/.pnpm/@cto.af+linebreak@4.0.3/node_modules/@cto.af/linebreak/lib/index.js
var { AK, AL, AP, AS, B2, BA, BB, BK, CB, CL, CM, CP, CR, EB, EM, EX, GL, H2, H3, HH, HL, HY, ID, IN, IS, JL, JT, JV, LF, NU, OP, NL, NS, PO, PR, RI, SP, SY, QU, VF, VI, WJ, ZW, ZWJ } = names$1;
var ALHLNU = /* @__PURE__ */ new Set([
  AL,
  HL,
  NU
]);
var BKCRLFNLSPZW = /* @__PURE__ */ new Set([
  BK,
  CR,
  LF,
  NL,
  SP,
  ZW
]);
var IDEBEM = /* @__PURE__ */ new Set([
  ID,
  EB,
  EM
]);
var JLJVH2H3 = /* @__PURE__ */ new Set([
  JL,
  JV,
  H2,
  H3
]);
var JLJVJTH2H3 = /* @__PURE__ */ new Set([
  JL,
  JV,
  JT,
  H2,
  H3
]);
var JVJT = /* @__PURE__ */ new Set([JV, JT]);
var SPGLWJCLQUCPEXISSYBKCRLFNLZW = /* @__PURE__ */ new Set([
  SP,
  GL,
  WJ,
  CL,
  QU,
  CP,
  EX,
  IS,
  SY,
  BK,
  CR,
  LF,
  NL,
  ZW
]);
var sotBKCRLFNLOPQUGLSPZW = /* @__PURE__ */ new Set([
  -1,
  BK,
  CR,
  LF,
  NL,
  OP,
  QU,
  GL,
  SP,
  ZW
]);
/**
* @template T
* @typedef {ValuesWithKeys<T, keyof T>} EnumValues
*/
/**
* @template T
* @template {keyof T} K
* @typedef {T[K]} ValuesWithKeys
*/
/**
* This rule has no opinion.
*/
var PASS = Symbol("PASS");
/**
* This rule asserts that there must not be a break after the current
* code point.
*/
var NO_BREAK = Symbol("NO_BREAK");
/**
* This rule asserts that there may be a break after the current code point.
*/
var MAY_BREAK = Symbol("MAY_BREAK");
/**
* This rule asserts that there must be a line break after the current code point.
*/
var MUST_BREAK = Symbol("MUST_BREAK");
/**
* @typedef {EnumValues<typeof RuleResults>} RuleResultsEnum
*/
/**
* A rule that impacts linebreaking.  Looking ahead and behind one code point
* is fast, using `state.prev` and `state.next` respectively.  Looking ahead
* more code points is possible with `*BreakerState.codePoints()`, but be
* careful of causing ReDos vulnerabilities.
*
* @callback BreakRule
* @param {BreakerState} state
* @returns {RuleResultsEnum}
*/
/**
* LB2: Never break at the start of text.
*
* @type {BreakRule}
*/
function LB02(state) {
  if (state.cur.cls === -1 && state.next.cls !== -2) return NO_BREAK;
  return PASS;
}
/**
* LB3 Always break at the end of text.
*
* @type {BreakRule}
*/
function LB03(state) {
  if (state.next.cls === -2 && (state.cur.len === 0 || state.cur.len !== state.prevChunk)) return MUST_BREAK;
  return PASS;
}
/**
* LB4: Always break after hard line breaks.
*
* @type {BreakRule}
*/
function LB04(state) {
  if (state.cur.cls === BK) return MUST_BREAK;
  return PASS;
}
/**
* LB5: Treat CR followed by LF, as well as CR, LF, and NL as hard line
* breaks.
*
* @type {BreakRule}
*/
function LB05(state) {
  switch (state.cur.cls) {
    case CR:
      if (state.next.cls === LF) return NO_BREAK;
      return MUST_BREAK;
    case LF:
    case NL: return MUST_BREAK;
  }
  return PASS;
}
/**
* LB6: Do not break before hard line breaks.
*
* @type {BreakRule}
*/
function LB06(state) {
  switch (state.next.cls) {
    case BK:
    case CR:
    case LF:
    case NL: return NO_BREAK;
  }
  return PASS;
}
/**
* The end of a run of spaces, for rules that have "Do not break within
* ...even with intervening spaces", such as LB15.
*
* @type {BreakRule}
*/
function LBspacesStop(state) {
  if (state.cur.cls !== RI) state.RI = 0;
  if (state.spaces) {
    if (state.next.cls !== SP) state.spaces = false;
    return NO_BREAK;
  }
  return PASS;
}
/**
* LB7: Do not break before spaces or zero width space.
*
* @type {BreakRule}
*/
function LB07(state) {
  if (state.next.cls === ZW) return NO_BREAK;
  if (state.next.cls === SP) switch (state.cur.cls) {
    case ZW:
    case OP:
    case QU:
    case CL:
    case CP:
    case B2: break;
    default: return NO_BREAK;
  }
  return PASS;
}
/**
* LB8: Break before any character following a zero-width space, even if one or
* more spaces intervene.
*
* @type {BreakRule}
*/
function LB08(state) {
  if (state.LB8) {
    state.LB8 = false;
    return MAY_BREAK;
  } else if (state.cur.cls === ZW) {
    if (state.next.cls === SP) {
      state.LB8 = true;
      return NO_BREAK;
    }
    return MAY_BREAK;
  }
  return PASS;
}
/**
* LB8a: Do not break after a zero width joiner.
*
* @type {BreakRule}
*/
function LB08a(state) {
  if (state.cur.cls === ZWJ) return NO_BREAK;
  return PASS;
}
/**
* LB9: Do not break a combining character sequence; treat it as if it has the
* line breaking class of the base character in all of the following rules.
* Treat ZWJ as if it were CM.
*
* @type {BreakRule}
*/
function LB09(state) {
  if (!BKCRLFNLSPZW.has(state.cur.cls) && (state.next.cls === CM || state.next.cls === ZWJ)) {
    state.next.ignored = true;
    return NO_BREAK;
  }
  return PASS;
}
/**
* LB10: Treat any remaining combining mark or ZWJ as AL.
*
* @type {BreakRule}
*/
function LB10(state) {
  if (state.cur.cls === CM) state.cur.cls = AL;
  if (state.next.cls === CM) state.next.cls = AL;
  return PASS;
}
/**
* LB11: Do not break before or after Word joiner and related characters.
*
* @type {BreakRule}
*/
function LB11(state) {
  if (state.next.cls === WJ || state.cur.cls === WJ) return NO_BREAK;
  return PASS;
}
/**
* LB12: Do not break after NBSP and related characters.
*
* @type {BreakRule}
*/
function LB12(state) {
  if (state.cur.cls === GL) return NO_BREAK;
  return PASS;
}
/**
* LB12a: Do not break before NBSP and related characters, except after spaces
* and hyphens.
*
* @type {BreakRule}
*/
function LB12a(state) {
  if (state.next.cls === GL) switch (state.cur.cls) {
    case SP:
    case BA:
    case HY:
    case HH: return PASS;
    default: return NO_BREAK;
  }
  return PASS;
}
/**
* LB13: Do not break before ‘]’ or ‘!’ or ‘;’ or ‘/’, even after spaces.
*
* @type {BreakRule}
*/
function LB13(state) {
  switch (state.next.cls) {
    case CL:
    case CP:
    case EX:
    case SY: return NO_BREAK;
  }
  return PASS;
}
/**
* LB14: Do not break after ‘[’, even after spaces.
*
* @type {BreakRule}
*/
function LB14(state) {
  if (state.cur.cls === OP) {
    if (state.next.cls === SP) state.spaces = true;
    return NO_BREAK;
  }
  return PASS;
}
/**
* LB15a: Do not break after an unresolved initial punctuation that lies at
* the start of the line, after a space, after opening punctuation, or after
* an unresolved quotation mark, even after spaces.
*
* @type {BreakRule}
*/
function LB15a(state) {
  if (sotBKCRLFNLOPQUGLSPZW.has(state.prev.cls) && /^\p{Pi}$/u.test(state.cur.char) && state.cur.cls === QU) {
    state.spaces = true;
    return NO_BREAK;
  }
  return PASS;
}
/**
* LB15b: Do not break before an unresolved final punctuation that lies at the
* end of the line, before a space, before a prohibited break, or before an
* unresolved quotation mark, even after spaces.
*
* @type {BreakRule}
*/
function LB15b(state) {
  if (/^\p{gc=Pf}$/u.test(state.next.char) && state.next.cls === QU) {
    const after = state.afterNext();
    if (!after) return NO_BREAK;
    if (SPGLWJCLQUCPEXISSYBKCRLFNLZW.has(after.cls)) return NO_BREAK;
  }
  return PASS;
}
/**
* LB15c: Break before a decimal mark that follows a space, for instance, in
* ‘subtract .5’.
*
* @type {BreakRule}
*/
function LB15c(state) {
  if (state.cur.cls === SP && state.next.cls === IS) {
    if (state.afterNext()?.cls === NU) return MAY_BREAK;
  }
  return PASS;
}
/**
* LB15d: Otherwise, do not break before ‘;’, ‘,’, or ‘.’, even after spaces
*
* @type {BreakRule}
*/
function LB15d(state) {
  if (state.next.cls === IS) return NO_BREAK;
  return PASS;
}
/**
* LB16: Do not break between closing punctuation and a nonstarter (lb=NS),
* even with intervening spaces.
*
* @type {BreakRule}
*/
function LB16(state) {
  if (state.cur.cls === CL || state.cur.cls === CP) {
    if (state.classAfterSpaces(state.cur.len) === NS) {
      if (state.next.cls === SP) state.spaces = true;
      return NO_BREAK;
    }
    if (state.next.cls === SP) return NO_BREAK;
  }
  return PASS;
}
/**
* LB17: Do not break within ‘——’, even with intervening spaces.
*
* @type {BreakRule}
*/
function LB17(state) {
  if (state.cur.cls === B2) {
    if (state.classAfterSpaces(state.cur.len) === B2) {
      if (state.next.cls !== SP) return NO_BREAK;
      state.spaces = true;
      return NO_BREAK;
    } else if (state.next.cls === SP) return NO_BREAK;
  }
  return PASS;
}
/**
* LB18: Break after spaces.
*
* @type {BreakRule}
*/
function LB18(state) {
  if (state.cur.cls === SP) return MAY_BREAK;
  return PASS;
}
/**
* LB19: Do not break before non-initial unresolved quotation marks, such as ‘
* ” ’ or ‘ " ’, nor after non-final unresolved quotation marks, such as ‘ “ ’
* or ‘ " ’.
*
* @type {BreakRule}
*/
function LB19(state) {
  if (state.next.cls === QU && !/^\p{Pi}$/u.test(state.next.char)) return NO_BREAK;
  if (state.cur.cls === QU && !/^\p{Pf}$/u.test(state.cur.char)) return NO_BREAK;
  return PASS;
}
/**
* LB19a: Unless surrounded by East Asian characters, do not break either side
* of any unresolved quotation marks.
*
* @type {BreakRule}
*/
function LB19a(state) {
  if (!EastAsianWidth.get(state.cur.cp) && state.next.cls === QU) return NO_BREAK;
  if (state.next.cls === QU) {
    const after = state.afterNext();
    if (!after || !EastAsianWidth.get(after.cp)) return NO_BREAK;
  }
  if (state.cur.cls === QU && !EastAsianWidth.get(state.next.cp)) return NO_BREAK;
  if ((state.prev.cls === -1 || !EastAsianWidth.get(state.prev.cp)) && state.cur.cls === QU) return NO_BREAK;
  return PASS;
}
/**
* LB20: Break before and after unresolved CB.
*
* @type {BreakRule}
*/
function LB20(state) {
  if (state.cur.cls === CB || state.next.cls === CB) return MAY_BREAK;
  return PASS;
}
var sotBKCRLFNLSPZWCBGL = /* @__PURE__ */ new Set([
  -1,
  BK,
  CR,
  LF,
  NL,
  SP,
  ZW,
  CB,
  GL
]);
/**
* LB20a: Do not break after a word-initial hyphen.
*
* @type {BreakRule}
*/
function LB20a(state) {
  if (sotBKCRLFNLSPZWCBGL.has(state.prev.cls) && (state.cur.cls === HY || state.cur.cls === HH) && (state.next.cls === AL || state.next.cls === HL)) return NO_BREAK;
  return PASS;
}
/**
* LB21: Do not break before hyphen-minus, other hyphens, fixed-width spaces,
* small kana, and other non-starters, or after acute accents.
*
* @type {BreakRule}
*/
function LB21(state) {
  if (state.cur.cls === BB) return NO_BREAK;
  switch (state.next.cls) {
    case BA:
    case HH:
    case HY:
    case NS: return NO_BREAK;
  }
  return PASS;
}
/**
* LB21a: Do not break after the hyphen in Hebrew + Hyphen + non-Hebrew.
*
* @type {BreakRule}
*/
function LB21a(state) {
  if (state.prev.cls === HL && (state.cur.cls === HY || state.cur.cls === HH) && state.next.cls !== HL) return NO_BREAK;
  return PASS;
}
/**
* LB21b: Don’t break between Solidus and Hebrew letters.
*
* @type {BreakRule}
*/
function LB21b(state) {
  if (state.cur.cls === SY && state.next.cls === HL) return NO_BREAK;
  return PASS;
}
/**
* LB22: Do not break before ellipses.
*
* @type {BreakRule}
*/
function LB22(state) {
  if (state.next.cls === IN) return NO_BREAK;
  return PASS;
}
/**
* LB23: Do not break between digits and letters.
*
* @type {BreakRule}
*/
function LB23(state) {
  switch (state.cur.cls) {
    case AL:
    case HL:
      if (state.next.cls === NU) return NO_BREAK;
      break;
    case NU: if (state.next.cls === AL || state.next.cls === HL) return NO_BREAK;
  }
  return PASS;
}
/**
* LB23a: Do not break between numeric prefixes and ideographs, or between
* ideographs and numeric postfixes.
*
* @type {BreakRule}
*/
function LB23a(state) {
  if (state.cur.cls === PR && IDEBEM.has(state.next.cls)) return NO_BREAK;
  if (state.next.cls === PO && IDEBEM.has(state.cur.cls)) return NO_BREAK;
  return PASS;
}
/**
* LB24: Do not break between numeric prefix/postfix and letters, or between
* letters and prefix/postfix.
*
* @type {BreakRule}
*/
function LB24(state) {
  if ((state.cur.cls === PR || state.cur.cls === PO) && (state.next.cls === AL || state.next.cls === HL)) return NO_BREAK;
  if ((state.cur.cls === AL || state.cur.cls === HL) && (state.next.cls === PR || state.next.cls === PO)) return NO_BREAK;
  return PASS;
}
var POPR = /* @__PURE__ */ new Set([PO, PR]);
var CLCP = /* @__PURE__ */ new Set([CL, CP]);
/**
* LB25: Do not break numbers.
* Approach: Find the end of a matching run, then no-break everything as we go
* past it.
*
* @type {BreakRule}
*/
function LB25(state) {
  let syIs = null;
  if (POPR.has(state.next.cls)) {
    if (CLCP.has(state.cur.cls)) syIs = state.prev.len;
    else syIs = state.cur.len;
  } else if (state.next.cls === NU) syIs = state.cur.len;
  if (syIs !== null) SyIsLoop: for (const { cls } of state.codePoints(syIs, false)) switch (cls) {
    case SY:
    case IS: continue;
    case NU: return NO_BREAK;
    default: break SyIsLoop;
  }
  if (state.cur.cls === PO || state.cur.cls === PR) {
    if (state.next.cls === OP) {
      const after = state.afterNext();
      if (after) {
        if (after.cls === NU) return NO_BREAK;
        else if (after.cls === IS) {
          if (state.afterNext(2)?.cls === NU) return NO_BREAK;
        }
      }
    } else if (state.next.cls === NU) return NO_BREAK;
  }
  if (state.cur.cls === HY && state.next.cls === NU) return NO_BREAK;
  if (state.cur.cls === IS && state.next.cls === NU) return NO_BREAK;
  return PASS;
}
/**
* LB26: Do not break a Korean syllable.
*
* @type {BreakRule}
*/
function LB26(state) {
  switch (state.cur.cls) {
    case JL:
      if (JLJVH2H3.has(state.next.cls)) return NO_BREAK;
      break;
    case JV:
    case H2:
      if (JVJT.has(state.next.cls)) return NO_BREAK;
      break;
    case JT:
    case H3: if (state.next.cls === JT) return NO_BREAK;
  }
  return PASS;
}
/**
* LB27: Treat a Korean Syllable Block the same as ID.
*
* @type {BreakRule}
*/
function LB27(state) {
  switch (state.cur.cls) {
    case JL:
    case JV:
    case JT:
    case H2:
    case H3:
      if (state.next.cls === PO) return NO_BREAK;
      break;
    case PR: if (JLJVJTH2H3.has(state.next.cls)) return NO_BREAK;
  }
  return PASS;
}
/**
* LB28 Do not break between alphabetics (“at”).
*
* @type {BreakRule}
*/
function LB28(state) {
  if ((state.cur.cls === AL || state.cur.cls === HL) && (state.next.cls === AL || state.next.cls === HL)) return NO_BREAK;
  return PASS;
}
/**
* LB28a: Do not break inside the orthographic syllables of Brahmic scripts.
*
* @type {BreakRule}
*/
function LB28a(state) {
  const { prev, cur, next } = state;
  const dotCircle = "◌";
  /**
  * AK | ◌ | AS
  *
  * @param {import('./state.js').BreakerChar} chr Check one char
  * @returns true if char matches
  */
  function akCas(chr) {
    return chr.cls === AK || chr.char === dotCircle || chr.cls === AS;
  }
  if (cur.cls === AP && akCas(next)) return NO_BREAK;
  if (akCas(cur) && (next.cls === VF || next.cls === VI)) return NO_BREAK;
  if (akCas(prev) && cur.cls === VI && (next.cls === AK || next.char === dotCircle)) return NO_BREAK;
  if (akCas(cur) && akCas(next) && state.afterNext()?.cls === VF) return NO_BREAK;
  return PASS;
}
/**
* LB29: Do not break between numeric punctuation and alphabetics (“e.g.”).
*
* @type {BreakRule}
*/
function LB29(state) {
  if (state.cur.cls === IS && (state.next.cls === AL || state.next.cls === HL)) return NO_BREAK;
  return PASS;
}
/**
* LB30: Do not break between letters, numbers, or ordinary symbols and
* opening or closing parentheses.
*
* @type {BreakRule}
*/
function LB30(state) {
  switch (state.cur.cls) {
    case AL:
    case HL:
    case NU:
      if (state.next.cls === OP && !EastAsianWidth.get(state.next.cp)) return NO_BREAK;
      break;
    case CP: if (!EastAsianWidth.get(state.cur.cp) && ALHLNU.has(state.next.cls)) return NO_BREAK;
  }
  return PASS;
}
/**
* LB30a: Break between two regional indicator symbols if and only if there
* are an even number of regional indicators preceding the position of the
* break.
*
* @type {BreakRule}
*/
function LB30a(state) {
  if (state.cur.cls === RI) {
    if (state.next.cls === RI) {
      if (++state.RI % 2 !== 0) return NO_BREAK;
    }
  } else state.RI = 0;
  return PASS;
}
/**
* LB30b: Do not break between an emoji base (or potential emoji) and an emoji
* modifier.
*
* @type {BreakRule}
*/
function LB30b(state) {
  if (state.cur.cls === EB && state.next.cls === EM) return NO_BREAK;
  if (state.next.cls === EM && /^\p{ExtPict}$/u.test(state.cur.char) && /^\p{gc=Cn}$/u.test(state.cur.char)) return NO_BREAK;
  return PASS;
}
/**
* LB31: Break everywhere else.
*
* @type {BreakRule}
*/
function LB31() {
  return MAY_BREAK;
}
/**
* @type {BreakRule[]}
* @private
*/
var rules = [
  LB02,
  LB03,
  LB04,
  LB05,
  LB06,
  LBspacesStop,
  LB07,
  LB08,
  LB08a,
  LB09,
  LB10,
  LB11,
  LB12,
  LB12a,
  LB13,
  LB14,
  LB15a,
  LB15b,
  LB15c,
  LB15d,
  LB16,
  LB17,
  LB18,
  LB19,
  LB19a,
  LB20,
  LB20a,
  LB21a,
  LB21,
  LB21b,
  LB22,
  LB23,
  LB23a,
  LB24,
  LB25,
  LB26,
  LB27,
  LB28,
  LB28a,
  LB29,
  LB30,
  LB30a,
  LB30b,
  LB31
];
var _opts = /* @__PURE__ */ new WeakMap();
var _Rules_brand = /* @__PURE__ */ new WeakSet();
/**
* Options for how rules are applied.
*
* @typedef {object} RulesOptions
* @prop {boolean} [string=false] Extract strings from input, rather than just
*   returning char offsets.
* @prop {boolean} [verbose=false] Turn on some verbose logging that is
*   useful for debug.
*/
var Rules = class {
  /**
  *
  * @param {RulesOptions} opts
  */
  constructor(opts = {}) {
    _classPrivateMethodInitSpec(this, _Rules_brand);
    _classPrivateFieldInitSpec(this, _opts, void 0);
    /**
    * @type {Required<RulesOptions>}
    */
    _classPrivateFieldSet2(_opts, this, {
      string: false,
      example7: false,
      verbose: false,
      ...opts
    });
    /**
    * Copy of rules, safe to tweak.
    *
    * @type {BreakRule[]}
    */
    this.rules = [...rules];
    if (_classPrivateFieldGet2(_opts, this).example7) throw new Error("'example7' flag deprecated");
    if (_classPrivateFieldGet2(_opts, this).verbose) this.rules.unshift((state) => {
      console.log(state.cur.len, state);
      return PASS;
    });
  }
  /**
  * Remove the rules with names as indicated.
  *
  * @param  {...string} names
  * @returns {BreakRule[]} The deleted rules
  */
  removeRule(...names) {
    /**
    * @type {BreakRule[]}
    */
    const ret = [];
    this.rules = this.rules.filter((r) => {
      if (names.includes(r.name)) {
        ret.push(r);
        return false;
      }
      return true;
    });
    return ret;
  }
  /**
  * Add rules after the one named `name`.
  *
  * @param {string} name The name of the rule before.
  * @param {...BreakRule} newRules
  * @returns {number} Index of start of the new rules
  */
  addRuleAfter(name, ...newRules) {
    const i = this.rules.findIndex((r) => r.name === name);
    if (i === -1) throw new Error(`Rule not found: "${name}"`);
    this.rules.splice(i + 1, 0, ...newRules);
    return i + 1;
  }
  /**
  * Add rules before the one named `name`.
  *
  * @param {string} name The name of the rule before.
  * @param {...BreakRule} newRules
  * @returns {number} Index of start of the new rules
  */
  addRuleBefore(name, ...newRules) {
    const i = this.rules.findIndex((r) => r.name === name);
    if (i === -1) throw new Error(`Rule not found: "${name}"`);
    this.rules.splice(i, 0, ...newRules);
    return i;
  }
  /**
  * Replace the rule named `name` with the given rules.
  *
  * @param {string} name The name of the rule before.
  * @param {...BreakRule} newRules
  * @returns {BreakRule[]} The replaced rules.
  */
  replaceRule(name, ...newRules) {
    const i = this.rules.findIndex((r) => r.name === name);
    if (i === -1) throw new Error(`Rule not found: "${name}"`);
    return this.rules.splice(i, 1, ...newRules);
  }
  /**
  * Enumerate all of the potential line breaks.
  *
  * @param {string} str
  */
  *breaks(str) {
    const state = new BreakerState(str);
    for (const step of state.codePoints(0)) {
      state.push(step);
      yield* _assertClassBrand(_Rules_brand, this, _exec).call(this, state);
    }
    state.pushEnd();
    yield* _assertClassBrand(_Rules_brand, this, _exec).call(this, state);
  }
};
/**
*
* @param {BreakerState} state
* @returns {Break?}
*/
function _execRules(state) {
  for (const rule of this.rules) {
    const res = rule.call(this, state);
    switch (res) {
      case PASS: break;
      case NO_BREAK:
        if (_classPrivateFieldGet2(_opts, this).verbose) console.log(`  ${rule.name}: NO_BREAK`);
        return null;
      case MAY_BREAK:
        if (_classPrivateFieldGet2(_opts, this).verbose) console.log(`  ${rule.name}: MAY_BREAK`);
        return new Break(state.cur.len);
      case MUST_BREAK:
        if (_classPrivateFieldGet2(_opts, this).verbose) console.log(`  ${rule.name}: MUST_BREAK`);
        return new Break(state.cur.len, true);
      default: throw new Error(`Invalid state: "${res}"`);
    }
  }
  return null;
}
/**
* @param {BreakerState} state
*/
function* _exec(state) {
  const res = _assertClassBrand(_Rules_brand, this, _execRules).call(this, state);
  if (res) {
    if (_classPrivateFieldGet2(_opts, this).string) res.string = state.str.slice(state.prevChunk, state.cur.len);
    if (state.props) {
      res.props = state.props;
      state.props = void 0;
    }
    yield res;
    state.prevChunk = state.cur.len;
  }
}
//#endregion
//#region src/text-layout.ts
function graphemeBoundaries(text, locale) {
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  const boundaries = /* @__PURE__ */ new Set([0]);
  for (const item of segmenter.segment(text)) boundaries.add(item.index + item.segment.length);
  return boundaries;
}
var _rules = /* @__PURE__ */ new WeakMap();
var _locale = /* @__PURE__ */ new WeakMap();
/**
* Adapts UAX #14 opportunities and removes positions inside grapheme clusters.
*/
var UnicodeLineBreakProvider = class {
  constructor(locale = "ja") {
    _classPrivateFieldInitSpec(this, _rules, new Rules());
    _classPrivateFieldInitSpec(this, _locale, void 0);
    _classPrivateFieldSet2(_locale, this, locale);
  }
  getBreakOpportunities(text) {
    const boundaries = graphemeBoundaries(text, _classPrivateFieldGet2(_locale, this));
    const opportunities = /* @__PURE__ */ new Map();
    for (const candidate of _classPrivateFieldGet2(_rules, this).breaks(text)) {
      if (!boundaries.has(candidate.position)) continue;
      opportunities.set(candidate.position, (opportunities.get(candidate.position) ?? false) || candidate.required);
    }
    return Object.freeze([...opportunities].sort(([left], [right]) => left - right).map(([position, required]) => Object.freeze({
      position,
      required
    })));
  }
};
var defaultLineBreakProviders = /* @__PURE__ */ new Map();
var newlinePattern = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/gu;
function defaultLineBreakProvider(locale) {
  const existing = defaultLineBreakProviders.get(locale);
  if (existing) return existing;
  const provider = new UnicodeLineBreakProvider(locale);
  defaultLineBreakProviders.set(locale, provider);
  return provider;
}
function requireWidth(width, label) {
  if (!Number.isFinite(width) || width < 0) throw new TypeError(`${label} must return a non-negative finite number.`);
  return width;
}
function normalizeOpportunities(text, provider, boundaries) {
  const normalized = /* @__PURE__ */ new Map();
  for (const opportunity of provider.getBreakOpportunities(text)) {
    const { position, required } = opportunity;
    if (!Number.isInteger(position) || position <= 0 || position > text.length || !boundaries.has(position)) continue;
    normalized.set(position, (normalized.get(position) ?? false) || required);
  }
  normalized.set(text.length, true);
  return [...normalized].sort(([left], [right]) => left - right).map(([position, required]) => ({
    position,
    required
  }));
}
function wrapParagraph(text, originalStart, input, provider, locale) {
  if (text.length === 0) return [{
    text: "",
    start: originalStart,
    end: originalStart,
    width: 0
  }];
  const boundarySet = graphemeBoundaries(text, locale);
  const boundaries = [...boundarySet].sort((left, right) => left - right);
  const opportunities = normalizeOpportunities(text, provider, boundarySet);
  const lines = [];
  let start = 0;
  while (start < text.length) {
    const requiredEnd = opportunities.find((opportunity) => opportunity.position > start && opportunity.required)?.position ?? text.length;
    let selected;
    let selectedWidth = 0;
    for (const opportunity of opportunities) {
      if (opportunity.position <= start || opportunity.position > requiredEnd) continue;
      const candidate = text.slice(start, opportunity.position);
      const width = requireWidth(input.measureText(candidate), "measureText");
      if (width <= input.maxWidth) {
        selected = opportunity.position;
        selectedWidth = width;
      }
    }
    if (selected === void 0) {
      const fallbackBoundaries = boundaries.filter((position) => position > start && position <= requiredEnd);
      for (const position of fallbackBoundaries) {
        const candidate = text.slice(start, position);
        const width = requireWidth(input.measureText(candidate), "measureText");
        if (width <= input.maxWidth) {
          selected = position;
          selectedWidth = width;
        }
      }
      if (selected === void 0) {
        selected = fallbackBoundaries[0] ?? requiredEnd;
        selectedWidth = requireWidth(input.measureText(text.slice(start, selected)), "measureText");
      }
    }
    lines.push({
      text: text.slice(start, selected),
      start: originalStart + start,
      end: originalStart + selected,
      width: selectedWidth
    });
    start = selected;
  }
  return lines;
}
/**
* Greedily chooses the last legal break that fits the measured pixel width.
* Explicit newlines are preserved. Unbreakable overflow falls back to a
* grapheme boundary, even when a single grapheme is wider than maxWidth.
*/
function wrapText(input) {
  if (typeof input.text !== "string") throw new TypeError("text must be a string.");
  if (!Number.isFinite(input.maxWidth) || input.maxWidth <= 0) throw new TypeError("maxWidth must be a positive finite number.");
  if (typeof input.measureText !== "function") throw new TypeError("measureText must be a function.");
  const locale = input.locale ?? "ja";
  const provider = input.lineBreakProvider ?? defaultLineBreakProvider(locale);
  const lines = [];
  let paragraphStart = 0;
  for (const newline of input.text.matchAll(newlinePattern)) {
    const newlineStart = newline.index;
    lines.push(...wrapParagraph(input.text.slice(paragraphStart, newlineStart), paragraphStart, input, provider, locale));
    paragraphStart = newlineStart + newline[0].length;
  }
  lines.push(...wrapParagraph(input.text.slice(paragraphStart), paragraphStart, input, provider, locale));
  return Object.freeze({
    lines: Object.freeze(lines.map((line) => Object.freeze(line))),
    maxLineWidth: Math.max(0, ...lines.map((line) => line.width))
  });
}
//#endregion
//#region src/content-run.ts
function isRecord$7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireExactRunKeys(run, keys) {
  const allowed = /* @__PURE__ */ new Set(["type", ...keys]);
  const unknown = Object.keys(run).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new TypeError(`Bubble content run has unknown properties: ${unknown.join(", ")}.`);
  for (const key of keys) if (typeof run[key] !== "string") throw new TypeError(`Bubble content run ${key} must be a string.`);
}
function normalizeRun(value) {
  if (!isRecord$7(value)) throw new TypeError("Bubble content run must be an object.");
  if (value.type === "text") {
    requireExactRunKeys(value, ["text"]);
    return Object.freeze({
      text: value.text,
      type: "text"
    });
  }
  if (value.type === "ruby") {
    requireExactRunKeys(value, ["base", "reading"]);
    const base = value.base;
    const reading = value.reading;
    if (base.length === 0) throw new TypeError("Bubble ruby run base must not be empty.");
    if (reading.length === 0) throw new TypeError("Bubble ruby run reading must not be empty.");
    return Object.freeze({
      base,
      reading,
      type: "ruby"
    });
  }
  throw new TypeError("Bubble content run type must be text or ruby.");
}
/**
* Accepts a plain string or a content run sequence and returns frozen runs.
* A string always yields a single text run so the plain path stays unchanged.
*/
function normalizeBubbleContent(value) {
  if (typeof value === "string") return Object.freeze([Object.freeze({
    text: value,
    type: "text"
  })]);
  if (!Array.isArray(value)) throw new TypeError("Bubble text must be a string or content run array.");
  const runs = value.map((run) => normalizeRun(run)).filter((run) => run.type !== "text" || run.text.length > 0);
  if (runs.length === 0) return Object.freeze([Object.freeze({
    text: "",
    type: "text"
  })]);
  return Object.freeze(runs);
}
/** True when the content carries no ruby run and can use the string path. */
function isPlainBubbleContent(content) {
  return content.every((run) => run.type === "text");
}
/**
* Projects content to plain text. Ruby runs contribute their base only, so the
* projection matches what a reader sees on the baseline.
*/
function bubbleContentPlainText(content) {
  return content.map((run) => run.type === "ruby" ? run.base : run.text).join("");
}
/** Merges adjacent text runs so revealed content stays compact. */
function mergeBubbleContent(content) {
  const runs = [];
  for (const run of content) {
    const previous = runs[runs.length - 1];
    if (run.type === "text" && previous?.type === "text") {
      runs[runs.length - 1] = Object.freeze({
        text: `${previous.text}${run.text}`,
        type: "text"
      });
      continue;
    }
    runs.push(run);
  }
  return Object.freeze(runs);
}
//#endregion
//#region src/reveal.ts
var bubbleRevealUnits = Object.freeze([
  "CHARACTER",
  "WORD",
  "LINE",
  "BLOCK"
]);
function graphemes(text) {
  const Segmenter = globalThis.Intl?.Segmenter;
  if (typeof Segmenter === "function") return [...new Segmenter(void 0, { granularity: "grapheme" }).segment(text)].map(({ segment }) => segment);
  return Array.from(text);
}
function requireUnit(value) {
  if (typeof value !== "string" || !bubbleRevealUnits.includes(value)) throw new TypeError("Bubble reveal unit must be CHARACTER, WORD, LINE, or BLOCK.");
  return value;
}
function normalizeBubbleReveal(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Bubble reveal must be an object.");
  const input = value;
  const allowed = /* @__PURE__ */ new Set([
    "unit",
    "delimiters",
    "showDelimiters",
    "layout",
    "intervalSeconds",
    "sound"
  ]);
  if (Object.keys(input).filter((key) => !allowed.has(key)).length > 0 || input.unit === void 0) throw new TypeError("Bubble reveal has unknown or missing properties.");
  const unit = requireUnit(input.unit);
  const delimiters = input.delimiters ?? " 	\r\n";
  if (typeof delimiters !== "string" || delimiters.length === 0) throw new TypeError("Bubble WORD delimiters must be a non-empty string.");
  const showDelimiters = input.showDelimiters ?? false;
  if (typeof showDelimiters !== "boolean") throw new TypeError("Bubble reveal showDelimiters must be boolean.");
  const layout = input.layout ?? "DYNAMIC";
  if (layout !== "DYNAMIC" && layout !== "RESERVED") throw new TypeError("Bubble reveal layout must be DYNAMIC or RESERVED.");
  const intervalSeconds = input.intervalSeconds ?? 0;
  if (typeof intervalSeconds !== "number" || !Number.isFinite(intervalSeconds) || intervalSeconds < 0) throw new TypeError("Bubble reveal intervalSeconds must be zero or greater.");
  const sound = input.sound;
  if (sound !== void 0 && (typeof sound !== "string" || sound.length === 0)) throw new TypeError("Bubble reveal sound must be a non-empty asset name.");
  return Object.freeze({
    unit,
    delimiters,
    showDelimiters,
    layout,
    intervalSeconds,
    ...sound === void 0 ? {} : { sound }
  });
}
function splitWords(text, delimiters, showDelimiters) {
  const delimiterSet = new Set(Array.from(delimiters));
  const result = [];
  let current = "";
  for (const character of graphemes(text)) {
    current += character;
    if (delimiterSet.has(character)) {
      if (showDelimiters || current.slice(0, -character.length).length > 0) result.push(showDelimiters ? current : current.slice(0, -character.length));
      current = "";
    }
  }
  if (current.length > 0) result.push(current);
  return result.filter((part) => part.length > 0);
}
/** Returns append-only chunks; joining the first n chunks gives the visible text. */
function splitBubbleText(text, reveal) {
  if (text.length === 0) return Object.freeze([""]);
  if (reveal.unit === "CHARACTER") return Object.freeze(graphemes(text));
  if (reveal.unit === "WORD") {
    const parts = splitWords(text, reveal.delimiters, reveal.showDelimiters);
    if (reveal.showDelimiters) return Object.freeze(parts);
    const result = [];
    let cursor = 0;
    for (const part of parts) {
      const index = text.indexOf(part, cursor);
      if (index < 0) result.push(part);
      else {
        result.push(part);
        cursor = index + part.length;
        while (cursor < text.length && reveal.delimiters.includes(text[cursor] ?? "")) cursor += 1;
      }
    }
    return Object.freeze(result);
  }
  const separator = reveal.unit === "LINE" ? /(?<=\n)/u : /\n{2,}/u;
  const rawParts = text.split(separator).filter((part) => part.length > 0);
  if (reveal.unit === "BLOCK") {
    const separators = [...text.matchAll(/\n{2,}/gu)].map(([match]) => match);
    const parts = rawParts.map((part, index) => index < separators.length ? `${part}${separators[index] ?? ""}` : part);
    return Object.freeze(parts.length > 0 ? parts : [text]);
  }
  const parts = rawParts;
  return Object.freeze(parts.length > 0 ? parts : [text]);
}
function contentChunk(runs) {
  return Object.freeze(mergeBubbleContent(Object.freeze([...runs])));
}
function textRun(text) {
  return Object.freeze({
    text,
    type: "text"
  });
}
/**
* Splits content on line or block boundaries. A ruby run is never split, so it
* always stays inside the chunk that carries its surrounding text.
*/
function splitContentByBoundary(content, unit) {
  const chunks = [];
  let current = [];
  const closeChunk = () => {
    if (current.length === 0) return;
    chunks.push(contentChunk(current));
    current = [];
  };
  for (const run of content) {
    if (run.type === "ruby") {
      current.push(run);
      continue;
    }
    if (unit === "LINE") {
      for (const part of run.text.split(/(?<=\n)/u)) {
        if (part.length === 0) continue;
        current.push(textRun(part));
        if (part.endsWith("\n")) closeChunk();
      }
      continue;
    }
    const parts = run.text.split(/(\n{2,})/u);
    for (const [index, part] of parts.entries()) {
      if (part.length === 0) continue;
      current.push(textRun(part));
      if (index % 2 === 1) closeChunk();
    }
  }
  closeChunk();
  return Object.freeze(chunks.length > 0 ? chunks : [contentChunk(content)]);
}
/**
* Returns append-only content chunks; joining the first n chunks gives the
* visible content. Plain content delegates to {@link splitBubbleText} so the
* string path keeps its exact behaviour, and a ruby run is always one whole
* reveal unit for every reveal unit kind.
*/
function splitBubbleContent(content, reveal) {
  if (isPlainBubbleContent(content)) return Object.freeze(splitBubbleText(bubbleContentPlainText(content), reveal).map((text) => Object.freeze([textRun(text)])));
  if (reveal.unit === "LINE" || reveal.unit === "BLOCK") return splitContentByBoundary(content, reveal.unit);
  const chunks = [];
  for (const run of content) {
    if (run.type === "ruby") {
      chunks.push(Object.freeze([run]));
      continue;
    }
    const parts = reveal.unit === "CHARACTER" ? graphemes(run.text) : splitWords(run.text, reveal.delimiters, reveal.showDelimiters);
    for (const part of parts) chunks.push(Object.freeze([textRun(part)]));
  }
  return Object.freeze(chunks.length > 0 ? chunks : [Object.freeze([textRun("")])]);
}
/** Joins the first n content chunks into the currently visible content. */
function revealedBubbleContent(chunks, count) {
  const visible = chunks.slice(0, Math.max(0, Math.min(count, chunks.length)));
  return mergeBubbleContent(Object.freeze(visible.flat()));
}
//#endregion
//#region src/portrait-layout.ts
var bubblePortraitPlacements = Object.freeze([
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
]);
var defaultBubblePortraitOffset = Object.freeze({
  x: 0,
  y: 0,
  zoomPercent: 100
});
function normalizeBubblePortraitPlacement(value) {
  if (typeof value !== "string") throw new TypeError("Bubble portrait placement must be a string.");
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (!bubblePortraitPlacements.includes(normalized)) throw new TypeError(`Unsupported Bubble portrait placement: ${value}`);
  return normalized;
}
function normalizeBubblePortraitOffset(value) {
  if (!Array.isArray(value) || value.length !== 2 && value.length !== 3) throw new TypeError("Bubble portrait offset must be [x, y] or [x, y, zoom].");
  const [x, y, zoomPercent = 100] = value;
  if (![
    x,
    y,
    zoomPercent
  ].every(Number.isFinite) || zoomPercent <= 0) throw new TypeError("Bubble portrait offset values must be finite and zoom positive.");
  return Object.freeze({
    x,
    y,
    zoomPercent
  });
}
function normalizeBubblePortraitCornerRadius(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError("Bubble portrait corner radius must be zero or greater.");
  return value;
}
var scratchDefaultOptionalStyleKeys = Object.freeze([
  "placement",
  "maxWidth",
  "textLocale",
  "distance",
  "tailLength",
  "offset",
  "visualStyle",
  "portrait",
  "continueIndicator",
  "reveal",
  "audio",
  "showAnimation",
  "hideAnimation"
]);
function isRecord$6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* The block-level basic style is intentionally narrow. Any explicit layout,
* body, media, reveal, or motion option selects the existing custom renderer.
*/
function bubbleLayoutProfileForStyleInput(value) {
  if (!isRecord$6(value)) return "custom";
  if (typeof value.textStyle !== "string" || value.textStyle.trim() !== "default") return "custom";
  return scratchDefaultOptionalStyleKeys.every((key) => value[key] === void 0) ? "scratch-default" : "custom";
}
function isScratchDefaultBubbleStyleInput(value) {
  return bubbleLayoutProfileForStyleInput(value) === "scratch-default";
}
/** Matches the numeric presentation and length limit used by say/think. */
function formatScratchBubbleArgument(value) {
  let formatted = value;
  if (typeof value === "number" && Math.abs(value) >= .01 && value % 1 !== 0) formatted = value.toFixed(2);
  return String(formatted).slice(0, 330);
}
function estimatedHelveticaWidth(text) {
  let units = 0;
  for (const character of text) {
    if (/\p{Mark}/u.test(character)) continue;
    if (/\s/u.test(character)) {
      units += .35;
      continue;
    }
    units += (character.codePointAt(0) ?? 0) <= 127 ? .62 : 1;
  }
  return units * 14;
}
function layoutScratchBubbleText(value, measureText = estimatedHelveticaWidth) {
  const text = value.slice(0, 330);
  const measured = (candidate) => {
    let width;
    try {
      width = measureText(candidate);
    } catch {
      return estimatedHelveticaWidth(candidate);
    }
    return Number.isFinite(width) && width >= 0 ? width : estimatedHelveticaWidth(candidate);
  };
  const wrapped = wrapText({
    text,
    maxWidth: 170,
    measureText: measured
  });
  const lines = Object.freeze(wrapped.lines.map((line) => Object.freeze({
    text: line.text,
    width: line.width
  })));
  return Object.freeze({
    lines,
    maxLineWidth: Math.max(0, ...lines.map((line) => line.width)),
    text: lines.map((line) => line.text).join("\n")
  });
}
function scratchBubbleMetrics(layout) {
  const lineCount = Math.max(1, layout.lines.length);
  const paddedWidth = Math.max(layout.maxLineWidth, 50) + 20;
  const paddedHeight = 16 * lineCount + 20;
  return Object.freeze({
    bodyHeight: paddedHeight + 4,
    bodyWidth: paddedWidth + 4,
    height: paddedHeight + 4 + 12,
    paddedHeight,
    paddedWidth,
    width: paddedWidth + 4
  });
}
function positionScratchBubble(input) {
  const stageLeft = -input.stageWidth / 2;
  const stageRight = input.stageWidth / 2;
  const stageTop = input.stageHeight / 2;
  let pointsLeft = input.pointsLeft;
  if (!pointsLeft && input.width + input.bounds.right > stageRight && input.bounds.left - input.width > stageLeft) pointsLeft = true;
  else if (pointsLeft && input.bounds.left - input.width < stageLeft && input.width + input.bounds.right < stageRight) pointsLeft = false;
  const left = pointsLeft ? Math.min(stageRight - input.width, Math.max(stageLeft, input.bounds.left - input.width)) : Math.max(stageLeft, Math.min(stageRight - input.width, input.bounds.right));
  const top = Math.min(stageTop, input.bounds.bottom + input.height);
  return Object.freeze({
    centerX: left + input.width / 2,
    centerY: top - input.height / 2,
    left,
    pointsLeft,
    top
  });
}
function escapeXml$1(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}
function scratchBodyPath(metrics) {
  const { paddedHeight: height, paddedWidth: width } = metrics;
  const radius = Math.min(16, width / 2, height / 2);
  return [
    `M ${radius} ${height}`,
    `Q 0 ${height} 0 ${height - radius}`,
    `L 0 ${radius}`,
    `Q 0 0 ${radius} 0`,
    `L ${width - radius} 0`,
    `Q ${width} 0 ${width} ${radius}`,
    `L ${width} ${height - radius}`,
    `Q ${width} ${height} ${width - radius} ${height}`
  ].join(" ");
}
function scratchSayBody(metrics) {
  const { paddedHeight: height, paddedWidth: width } = metrics;
  return `<path d="${`${scratchBodyPath(metrics)} C ${width - 16} ${height + 4} ${width - 12} ${height + 8} ${width - 12} ${height + 10} Q ${width - 12} ${height + 12} ${width - 14} ${height + 12} C ${width - 17} ${height + 12} ${width - 27} ${height + 8} ${width - 32} ${height} Z`}" fill="white" stroke="rgba(0, 0, 0, 0.15)" stroke-width="4" stroke-linejoin="round" paint-order="stroke fill"/>`;
}
function scratchThinkBody(metrics) {
  const { paddedHeight: height, paddedWidth: width } = metrics;
  return `<path d="${`${scratchBodyPath(metrics)} L ${width - 28} ${height} A 4 4 0 0 1 ${width - 36} ${height} Z`}" fill="white" stroke="rgba(0, 0, 0, 0.15)" stroke-width="4" stroke-linejoin="round" paint-order="stroke fill"/><circle cx="${width - 25.25}" cy="${height + 7.25}" r="2.25" fill="white" stroke="rgba(0, 0, 0, 0.15)" stroke-width="4" paint-order="stroke fill"/><circle cx="${width - 17.5}" cy="${height + 9.5}" r="1.5" fill="white" stroke="rgba(0, 0, 0, 0.15)" stroke-width="4" paint-order="stroke fill"/>`;
}
function renderScratchBubbleSvg(input) {
  const metrics = scratchBubbleMetrics(input.layout);
  const body = input.kind === "say" ? scratchSayBody(metrics) : scratchThinkBody(metrics);
  const bodyTransform = input.pointsLeft ? `translate(2 2)` : `translate(${metrics.width} 0) scale(-1 1) translate(2 2)`;
  const firstBaseline = 24.6;
  const text = input.layout.lines.map((line, index) => `<text x="12" y="${firstBaseline + 16 * index}" fill="#575E75" font-family="Helvetica, sans-serif" font-size="14" xml:space="preserve">${escapeXml$1(line.text)}</text>`).join("");
  const title = escapeXml$1(input.title ?? `${input.kind} bubble`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.width}" height="${metrics.height}" viewBox="0 0 ${metrics.width} ${metrics.height}" role="img" data-bubble-profile="scratch-default" data-bubble-kind="${input.kind}"><title>${title}</title><g transform="${bodyTransform}">${body}</g>${text}</svg>`;
}
//#endregion
//#region src/composition.ts
var BubbleCompositionError = class extends Error {
  constructor(code, message) {
    super(message);
    _defineProperty(this, "code", void 0);
    this.name = "BubbleCompositionError";
    this.code = code;
  }
};
var validKinds = /* @__PURE__ */ new Set(["say", "think"]);
var validAnimationModes$1 = /* @__PURE__ */ new Set([
  "idle",
  "talking",
  "awaiting-continue"
]);
var validMotionNames = /* @__PURE__ */ new Set([
  "fadeIn",
  "fadeOut",
  "floatIn",
  "floatOut",
  "zoomIn",
  "zoomOut",
  "riseUp",
  "sink",
  "shake",
  "explode",
  "animateBubbleShape"
]);
var validEases = /* @__PURE__ */ new Set([
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut"
]);
function isRecord$5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireExactKeys$1(value, required, optional, label) {
  const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unknown.length > 0) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label} has missing or unknown properties.`);
}
function requireName$1(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label} must be a non-empty string.`);
  return value.trim();
}
function requireAssetName(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label} must be a non-empty string.`);
  return value;
}
function normalizeAnimation(value, label, minimumFrames) {
  if (!isRecord$5(value)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label} must be an object.`);
  requireExactKeys$1(value, ["frames", "frameIntervalSeconds"], [], label);
  if (!Array.isArray(value.frames) || value.frames.length < minimumFrames) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label}.frames must contain at least ${minimumFrames} image asset name${minimumFrames === 1 ? "" : "s"}.`);
  const frames = Object.freeze(value.frames.map((frame, index) => requireAssetName(frame, `${label}.frames[${index}]`)));
  const interval = value.frameIntervalSeconds;
  if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label}.frameIntervalSeconds must be a positive finite number.`);
  return Object.freeze({
    frames,
    frameIntervalSeconds: interval
  });
}
function normalizePortrait(value) {
  if (!isRecord$5(value)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Bubble portrait must be an object.");
  requireExactKeys$1(value, ["base"], [
    "blink",
    "lipSync",
    "placement",
    "offset",
    "cornerRadius"
  ], "Bubble portrait");
  const blink = value.blink === void 0 ? void 0 : normalizeAnimation(value.blink, "Bubble portrait blink", 1);
  const lipSync = value.lipSync === void 0 ? void 0 : normalizeAnimation(value.lipSync, "Bubble portrait lip-sync", 1);
  let placement;
  let offset;
  let cornerRadius;
  try {
    placement = normalizeBubblePortraitPlacement(value.placement ?? "left");
    offset = value.offset === void 0 ? defaultBubblePortraitOffset : normalizeBubblePortraitOffset(value.offset);
    cornerRadius = normalizeBubblePortraitCornerRadius(value.cornerRadius ?? 0);
  } catch (error) {
    throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", error instanceof Error ? error.message : "Bubble portrait layout is invalid.");
  }
  return Object.freeze({
    base: requireAssetName(value.base, "Bubble portrait base"),
    ...blink === void 0 ? {} : { blink },
    ...lipSync === void 0 ? {} : { lipSync },
    placement,
    offset,
    cornerRadius
  });
}
function normalizeMotion(value, label) {
  if (!isRecord$5(value)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label} must be an object.`);
  requireExactKeys$1(value, ["name"], [
    "durationSeconds",
    "ease",
    "direction",
    "count",
    "relativeScale",
    "speed",
    "visualStyle"
  ], label);
  if (!validMotionNames.has(value.name)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label}.name is not a supported Bubble motion.`);
  const numberField = (key, minimum, integer = false) => {
    const candidate = value[key];
    if (candidate === void 0) return void 0;
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < minimum || integer && !Number.isInteger(candidate)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label}.${key} is invalid.`);
    return candidate;
  };
  const durationSeconds = numberField("durationSeconds", 0);
  const count = numberField("count", 1, true);
  const relativeScale = numberField("relativeScale", 0);
  const speed = numberField("speed", 0);
  const direction = value.direction;
  if (direction !== void 0 && typeof direction !== "number" && typeof direction !== "string") throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label}.direction is invalid.`);
  const ease = value.ease ?? "easeInOut";
  if (typeof ease !== "string" || !validEases.has(ease)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label}.ease is invalid.`);
  const visualStyle = value.visualStyle;
  if (visualStyle !== void 0 && (typeof visualStyle !== "string" || !bubbleVisualStyles.includes(visualStyle))) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `${label}.visualStyle is invalid.`);
  return Object.freeze({
    name: value.name,
    ...durationSeconds === void 0 ? {} : { durationSeconds },
    ease,
    ...direction === void 0 ? {} : { direction },
    ...count === void 0 ? {} : { count },
    ...relativeScale === void 0 ? {} : { relativeScale },
    ...speed === void 0 ? {} : { speed },
    ...visualStyle === void 0 ? {} : { visualStyle }
  });
}
function normalizeAudio(value) {
  if (value === void 0) return void 0;
  if (!isRecord$5(value)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Bubble audio must be an object.");
  requireExactKeys$1(value, [], [
    "voice",
    "reveal",
    "finish"
  ], "Bubble audio");
  const result = {};
  for (const key of [
    "voice",
    "reveal",
    "finish"
  ]) {
    const asset = value[key];
    if (asset !== void 0) result[key] = requireAssetName(asset, `Bubble audio ${key}`);
  }
  return Object.freeze(result);
}
function normalizeStyle(value) {
  if (!isRecord$5(value)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Bubble style must be an object.");
  requireExactKeys$1(value, ["name", "textStyle"], [
    "placement",
    "maxWidth",
    "textLocale",
    "distance",
    "tailLength",
    "offset",
    "visualStyle",
    "portrait",
    "continueIndicator",
    "reveal",
    "audio",
    "showAnimation",
    "hideAnimation"
  ], "Bubble style");
  const portrait = value.portrait === void 0 ? void 0 : normalizePortrait(value.portrait);
  const continueIndicator = value.continueIndicator === void 0 ? void 0 : normalizeAnimation(value.continueIndicator, "Bubble continue indicator", 2);
  let reveal;
  if (value.reveal !== void 0) try {
    reveal = normalizeBubbleReveal(value.reveal);
  } catch (error) {
    throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", error instanceof Error ? error.message : "Bubble reveal is invalid.");
  }
  const audio = normalizeAudio(value.audio);
  const showAnimation = value.showAnimation === void 0 ? void 0 : normalizeMotion(value.showAnimation, "Bubble showAnimation");
  const hideAnimation = value.hideAnimation === void 0 ? void 0 : normalizeMotion(value.hideAnimation, "Bubble hideAnimation");
  let placement;
  try {
    placement = normalizeBubblePlacement(value.placement ?? "up-right");
  } catch (error) {
    throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", error instanceof Error ? error.message : "Bubble placement is invalid.");
  }
  let distance;
  let tailLength;
  let offset;
  try {
    distance = normalizeBubbleDistance(value.distance ?? 12);
    tailLength = normalizeBubbleTailLength(value.tailLength ?? 18);
    offset = value.offset === void 0 ? defaultBubbleOffset : normalizeBubbleOffset(value.offset);
  } catch (error) {
    throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", error instanceof Error ? error.message : "Bubble actor-relative transform is invalid.");
  }
  const visualStyle = value.visualStyle ?? "NORMAL";
  if (typeof visualStyle !== "string" || !bubbleVisualStyles.includes(visualStyle)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", `Unsupported Bubble visual style: ${String(visualStyle)}`);
  let maxWidth;
  if (value.maxWidth !== void 0) {
    if (typeof value.maxWidth !== "number" || !Number.isFinite(value.maxWidth) || value.maxWidth <= 0) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Bubble style maxWidth must be a positive finite number.");
    maxWidth = value.maxWidth;
  }
  const textLocale = value.textLocale === void 0 ? void 0 : requireName$1(value.textLocale, "Bubble style text locale");
  const layoutProfile = bubbleLayoutProfileForStyleInput(value);
  return Object.freeze({
    name: requireName$1(value.name, "Bubble style name"),
    textStyle: requireName$1(value.textStyle, "Bubble text style name"),
    layoutProfile,
    ...maxWidth === void 0 ? {} : { maxWidth },
    ...textLocale === void 0 ? {} : { textLocale },
    placement,
    distance,
    tailLength,
    offset,
    visualStyle,
    ...portrait === void 0 ? {} : { portrait },
    ...continueIndicator === void 0 ? {} : { continueIndicator },
    ...reveal === void 0 ? {} : { reveal },
    ...audio === void 0 ? {} : { audio },
    ...showAnimation === void 0 ? {} : { showAnimation },
    ...hideAnimation === void 0 ? {} : { hideAnimation }
  });
}
function validateImageResolver(value) {
  if (value === void 0) return void 0;
  if (!isRecord$5(value) || typeof value.applyToTarget !== "function" || typeof value.getMimeType !== "function" || typeof value.isRegistered !== "function") throw new TypeError("Bubble image capability must provide applyToTarget, getMimeType, and isRegistered.");
  return value;
}
function validateAudioCapability(value) {
  if (value === void 0) return void 0;
  if (!isRecord$5(value) || typeof value.playSound !== "function") throw new TypeError("Bubble audio capability must provide playSound.");
  if (value.isRegistered !== void 0 && typeof value.isRegistered !== "function") throw new TypeError("Bubble audio capability isRegistered must be a function.");
  if (value.getMimeType !== void 0 && typeof value.getMimeType !== "function") throw new TypeError("Bubble audio capability getMimeType must be a function.");
  return value;
}
function requireImageResolver(value) {
  if (value === void 0) throw new BubbleCompositionError("BUBBLE-COMPOSITION-006", "Bubble image assets require an image capability. Provide options.imageResolver.");
  return value;
}
function validateTextCapability(value) {
  if (!isRecord$5(value) || typeof value.setText !== "function" || typeof value.releaseTarget !== "function") throw new TypeError("Bubble text capability must provide setText and releaseTarget.");
  return value;
}
function defaultScheduler() {
  return Object.freeze({
    setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    clearTimeout: (handle) => globalThis.clearTimeout(handle)
  });
}
function validateScheduler(value) {
  if (!isRecord$5(value) || typeof value.setTimeout !== "function" || typeof value.clearTimeout !== "function") throw new TypeError("Bubble scheduler must provide setTimeout and clearTimeout.");
  return value;
}
function validateAssetTarget(value, label) {
  if (!isRecord$5(value) || typeof value.id !== "string" || value.id.length === 0 || typeof value.isStage !== "boolean") throw new BubbleCompositionError("BUBBLE-COMPOSITION-004", `${label} must provide id and isStage.`);
  return value;
}
function validateTextTarget(value) {
  if (typeof value !== "object" || value === null) throw new BubbleCompositionError("BUBBLE-COMPOSITION-004", "Bubble text target must be a non-null object.");
  return value;
}
function validateSurface(value, style) {
  if (!isRecord$5(value) || !isRecord$5(value.targets) || typeof value.setLayerVisible !== "function" || typeof value.updateStyle !== "function" || typeof value.show !== "function" || typeof value.hide !== "function" || typeof value.dispose !== "function") throw new BubbleCompositionError("BUBBLE-COMPOSITION-004", "Bubble surface is invalid.");
  const targets = value.targets;
  validateTextTarget(targets.text);
  const assetTargetIds = /* @__PURE__ */ new Set();
  const requireLayerTarget = (key, required) => {
    const target = targets[key];
    if (!required && target === void 0) return;
    const validated = validateAssetTarget(target, `Bubble surface ${key}`);
    if (assetTargetIds.has(validated.id)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-004", "Bubble image layers must use distinct target IDs.");
    assetTargetIds.add(validated.id);
  };
  requireLayerTarget("portraitBase", style.portrait !== void 0);
  requireLayerTarget("portraitBlink", style.portrait?.blink !== void 0);
  requireLayerTarget("portraitLipSync", style.portrait?.lipSync !== void 0);
  requireLayerTarget("continueIndicator", style.continueIndicator !== void 0);
  return value;
}
function requireImageAsset(imageResolver, name) {
  if (imageResolver === void 0) throw new BubbleCompositionError("BUBBLE-COMPOSITION-006", `Bubble image capability is required for: ${name}. Provide options.imageResolver.`);
  if (!imageResolver.isRegistered(name)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-003", `Bubble image asset is not registered: ${name}`);
  if (!imageResolver.getMimeType(name).startsWith("image/")) throw new BubbleCompositionError("BUBBLE-COMPOSITION-003", `Bubble asset is not an image: ${name}`);
}
function requireAudioAsset(audio, name) {
  if (audio === void 0) throw new BubbleCompositionError("BUBBLE-COMPOSITION-006", `Bubble audio assets require an audio capability: ${name}. Provide options.audio.`);
  if (audio.isRegistered?.(name) === false) throw new BubbleCompositionError("BUBBLE-COMPOSITION-003", `Bubble audio asset is not registered: ${name}`);
  const mimeType = audio.getMimeType?.(name);
  if (mimeType !== void 0 && !mimeType.startsWith("audio/")) throw new BubbleCompositionError("BUBBLE-COMPOSITION-003", `Bubble asset is not audio: ${name}`);
}
function styleAssetNames(style) {
  return [...style.portrait === void 0 ? [] : [
    style.portrait.base,
    ...style.portrait.blink?.frames ?? [],
    ...style.portrait.lipSync?.frames ?? []
  ], ...style.continueIndicator?.frames ?? []];
}
/**
* Ruby annotations must never be dropped silently, so content that carries a
* ruby run requires a text capability that implements the rich path.
*/
function requireRichTextCapability(textCapability) {
  const setRichText = textCapability.setRichText;
  if (typeof setRichText !== "function") throw new BubbleCompositionError("BUBBLE-COMPOSITION-007", "Bubble ruby content requires the text capability setRichText method.");
  return setRichText;
}
/**
* Splits content into reveal chunks, preferring a capability that lays the
* runs out itself. The Bubble fallback keeps every ruby run whole.
*/
function splitContentForReveal(content, reveal, styleName, textCapability) {
  if (!isPlainBubbleContent(content) && typeof textCapability.splitRichText === "function") return textCapability.splitRichText({
    reveal,
    runs: content,
    styleName
  });
  return splitBubbleContent(content, reveal);
}
function formatBubbleText(text, style, textCapability) {
  if (style.layoutProfile === "scratch-default") return layoutScratchBubbleText(text, (candidate) => typeof textCapability.measureText === "function" ? textCapability.measureText({
    styleName: style.textStyle,
    text: candidate
  }) : NaN).text;
  if (style.maxWidth === void 0) return text;
  if (typeof textCapability.measureText !== "function") throw new BubbleCompositionError("BUBBLE-COMPOSITION-007", "Bubble style maxWidth requires the text capability measureText method.");
  return wrapText({
    text,
    maxWidth: style.maxWidth,
    ...style.textLocale === void 0 ? {} : { locale: style.textLocale },
    measureText: (candidate) => textCapability.measureText?.({
      styleName: style.textStyle,
      text: candidate
    }) ?? 0
  }).lines.map(({ text: line }) => line).join("\n");
}
function aggregateErrors(errors, message) {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}
function createFrameLoop(options) {
  let running = false;
  let generation = 0;
  let frameIndex = 0;
  let timer;
  let pending = Promise.resolve();
  const applyFrame = async (index) => {
    const assetName = options.animation.frames[index];
    if (assetName === void 0) return;
    await options.imageResolver.applyToTarget(assetName, options.target);
  };
  const reportError = (error, assetName) => {
    options.onError?.(error, Object.freeze({
      actorKey: options.actorKey,
      layer: options.layer,
      assetName
    }));
  };
  const schedule = (expectedGeneration) => {
    timer = options.scheduler.setTimeout(() => {
      timer = void 0;
      if (!running || generation !== expectedGeneration) return;
      frameIndex = (frameIndex + 1) % options.animation.frames.length;
      const assetName = options.animation.frames[frameIndex];
      pending = pending.then(() => applyFrame(frameIndex)).catch((error) => {
        running = false;
        generation += 1;
        reportError(error, assetName ?? "");
      }).then(() => {
        if (running && generation === expectedGeneration) schedule(expectedGeneration);
      });
    }, options.animation.frameIntervalSeconds * 1e3);
  };
  return Object.freeze({
    async start(startOptions = {}) {
      if (running) return;
      running = true;
      generation += 1;
      const expectedGeneration = generation;
      frameIndex = 0;
      if (!(startOptions.primed ?? false)) await applyFrame(frameIndex);
      if (!running || generation !== expectedGeneration) return;
      schedule(expectedGeneration);
    },
    async stop(stopOptions = {}) {
      const wasRunning = running;
      running = false;
      generation += 1;
      if (timer !== void 0) options.scheduler.clearTimeout(timer);
      timer = void 0;
      await pending;
      if ((stopOptions.reset ?? false) && (wasRunning || frameIndex !== 0)) {
        frameIndex = 0;
        await applyFrame(frameIndex);
      }
    }
  });
}
function normalizeShowInput(value) {
  if (!isRecord$5(value)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Show bubble input must be an object.");
  requireExactKeys$1(value, [
    "actor",
    "actorKey",
    "kind",
    "text",
    "styleName"
  ], ["animationMode", "reveal"], "Show bubble input");
  if (!validKinds.has(value.kind)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Bubble kind must be say or think.");
  let content;
  try {
    content = normalizeBubbleContent(value.text);
  } catch (error) {
    throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", error instanceof Error ? error.message : "Bubble text is invalid.");
  }
  const animationMode = value.animationMode ?? "talking";
  if (!validAnimationModes$1.has(animationMode)) throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Bubble animation mode is invalid.");
  let reveal;
  if (value.reveal !== void 0) try {
    reveal = normalizeBubbleReveal(value.reveal);
  } catch (error) {
    throw new BubbleCompositionError("BUBBLE-COMPOSITION-001", error instanceof Error ? error.message : "Bubble reveal is invalid.");
  }
  return {
    actor: value.actor,
    actorKey: requireName$1(value.actorKey, "Bubble actor key"),
    kind: value.kind,
    content,
    styleName: requireName$1(value.styleName, "Bubble style name"),
    animationMode,
    ...reveal === void 0 ? {} : { reveal }
  };
}
function createBubbleComposition(options) {
  if (!isRecord$5(options)) throw new TypeError("Bubble composition options must be an object.");
  const imageResolver = validateImageResolver(options.imageResolver);
  const audio = validateAudioCapability(options.audio);
  const textCapability = validateTextCapability(options.textCapability);
  if (typeof options.createSurface !== "function") throw new TypeError("Bubble composition createSurface must be a function.");
  if (options.onAnimationError !== void 0 && typeof options.onAnimationError !== "function") throw new TypeError("Bubble composition onAnimationError must be a function.");
  const scheduler = validateScheduler(options.scheduler ?? defaultScheduler());
  const styles = /* @__PURE__ */ new Map();
  const active = /* @__PURE__ */ new Map();
  const actorQueues = /* @__PURE__ */ new Map();
  let disposed = false;
  const ensureActive = () => {
    if (disposed) throw new BubbleCompositionError("BUBBLE-COMPOSITION-005", "Bubble composition has been disposed.");
  };
  const enqueueActor = async (actorKey, operation) => {
    const current = (actorQueues.get(actorKey) ?? Promise.resolve()).catch(() => void 0).then(operation);
    actorQueues.set(actorKey, current);
    try {
      return await current;
    } finally {
      if (actorQueues.get(actorKey) === current) actorQueues.delete(actorKey);
    }
  };
  const showNow = async (input) => {
    ensureActive();
    const style = styles.get(input.styleName);
    if (!style) throw new BubbleCompositionError("BUBBLE-COMPOSITION-002", `Bubble style is not defined: ${input.styleName}`);
    let activeStyle = style;
    if (input.reveal !== void 0) activeStyle = Object.freeze({
      ...style,
      layoutProfile: "custom",
      reveal: input.reveal
    });
    let currentContent = input.content;
    const resolveStyleImageCapability = (nextStyle) => {
      const assetNames = new Set(styleAssetNames(nextStyle));
      const nextImageResolver = assetNames.size === 0 ? void 0 : requireImageResolver(imageResolver);
      for (const assetName of assetNames) requireImageAsset(nextImageResolver, assetName);
      return nextImageResolver;
    };
    const styleImageResolver = resolveStyleImageCapability(activeStyle);
    for (const audioAsset of [
      activeStyle.audio?.voice,
      activeStyle.audio?.reveal,
      activeStyle.audio?.finish,
      activeStyle.reveal?.sound
    ]) if (audioAsset !== void 0) requireAudioAsset(audio, audioAsset);
    const playAudio = async (assetName, untilDone = false) => {
      if (assetName === void 0 || audio === void 0) return;
      await audio.playSound(assetName, { untilDone });
    };
    const primeStyleImages = async (nextStyle, nextImageResolver, nextSurface) => {
      const imageCapability = styleAssetNames(nextStyle).length === 0 ? void 0 : requireImageResolver(nextImageResolver);
      const operations = [];
      if (nextStyle.portrait) {
        const capability = requireImageResolver(imageCapability);
        operations.push(Promise.resolve(capability.applyToTarget(nextStyle.portrait.base, nextSurface.targets.portraitBase)));
        const blinkFirst = nextStyle.portrait.blink?.frames[0];
        if (blinkFirst !== void 0) operations.push(Promise.resolve(capability.applyToTarget(blinkFirst, nextSurface.targets.portraitBlink)));
        const lipSyncFirst = nextStyle.portrait.lipSync?.frames[0];
        if (lipSyncFirst !== void 0) operations.push(Promise.resolve(capability.applyToTarget(lipSyncFirst, nextSurface.targets.portraitLipSync)));
      }
      const continueFirst = nextStyle.continueIndicator?.frames[0];
      if (continueFirst !== void 0) {
        const capability = requireImageResolver(imageCapability);
        operations.push(Promise.resolve(capability.applyToTarget(continueFirst, nextSurface.targets.continueIndicator)));
      }
      await Promise.all(operations);
    };
    const createStyleLoops = (nextStyle, nextImageResolver, nextSurface) => {
      blinkLoop = nextStyle.portrait?.blink === void 0 ? void 0 : createFrameLoop({
        actorKey: input.actorKey,
        layer: "portraitBlink",
        animation: nextStyle.portrait.blink,
        target: nextSurface.targets.portraitBlink,
        imageResolver: requireImageResolver(nextImageResolver),
        scheduler,
        ...options.onAnimationError === void 0 ? {} : { onError: options.onAnimationError }
      });
      lipSyncLoop = nextStyle.portrait?.lipSync === void 0 ? void 0 : createFrameLoop({
        actorKey: input.actorKey,
        layer: "portraitLipSync",
        animation: nextStyle.portrait.lipSync,
        target: nextSurface.targets.portraitLipSync,
        imageResolver: requireImageResolver(nextImageResolver),
        scheduler,
        ...options.onAnimationError === void 0 ? {} : { onError: options.onAnimationError }
      });
      indicatorLoop = nextStyle.continueIndicator === void 0 ? void 0 : createFrameLoop({
        actorKey: input.actorKey,
        layer: "continueIndicator",
        animation: nextStyle.continueIndicator,
        target: nextSurface.targets.continueIndicator,
        imageResolver: requireImageResolver(nextImageResolver),
        scheduler,
        ...options.onAnimationError === void 0 ? {} : { onError: options.onAnimationError }
      });
    };
    const previous = active.get(input.actorKey);
    if (previous) await previous.close();
    let surface;
    let textOwned = false;
    let surfaceVisible = false;
    let blinkLoop;
    let lipSyncLoop;
    let indicatorLoop;
    let reveal = activeStyle.reveal;
    let revealChunks = reveal ? splitContentForReveal(input.content, reveal, activeStyle.textStyle, textCapability) : Object.freeze([input.content]);
    let revealedCount = reveal ? Math.min(1, revealChunks.length) : 1;
    let revealTimer;
    let revealGeneration = 0;
    try {
      surface = validateSurface(await options.createSurface(Object.freeze({
        actor: input.actor,
        actorKey: input.actorKey,
        kind: input.kind,
        style: activeStyle
      })), activeStyle);
      const applyRichText = (content, nextStyle, target) => {
        requireRichTextCapability(textCapability)({
          runs: content,
          styleName: nextStyle.textStyle,
          target,
          ...nextStyle.maxWidth === void 0 ? {} : { maxWidth: nextStyle.maxWidth }
        });
        textOwned = true;
      };
      /**
      * The whole bubble content, not the currently revealed slice, selects
      * the path. A partially revealed prefix that happens to carry no ruby
      * must not fall back to the plain renderer mid-reveal.
      */
      const usesRichPath = () => !isPlainBubbleContent(currentContent);
      const applySurfaceContent = async (content, nextStyle = activeStyle) => {
        if (usesRichPath()) {
          if (!surface) return;
          if (nextStyle.layoutProfile === "scratch-default" && surface.renderScratchText) throw new BubbleCompositionError("BUBBLE-COMPOSITION-007", "Bubble ruby content requires a rich text capability; the scratch-default surface renders plain text only.");
          applyRichText(content, nextStyle, surface.targets.text);
          return;
        }
        const rawText = bubbleContentPlainText(content);
        if (nextStyle.layoutProfile === "scratch-default" && surface?.renderScratchText) {
          const layout = layoutScratchBubbleText(rawText, (candidate) => typeof textCapability.measureText === "function" ? textCapability.measureText({
            styleName: nextStyle.textStyle,
            text: candidate
          }) : NaN);
          await surface.renderScratchText(layout);
          return;
        }
        if (!surface) return;
        textCapability.setText({
          styleName: nextStyle.textStyle,
          target: surface.targets.text,
          text: formatBubbleText(rawText, nextStyle, textCapability)
        });
        textOwned = true;
      };
      const applyReservedLayout = (content, nextStyle = activeStyle) => {
        if (!surface) return;
        if (!usesRichPath()) {
          textCapability.setText({
            styleName: nextStyle.textStyle,
            target: surface.targets.text,
            text: formatBubbleText(bubbleContentPlainText(content), nextStyle, textCapability)
          });
          textOwned = true;
        } else applyRichText(content, nextStyle, surface.targets.text);
        surface.captureTextLayout?.();
      };
      if (reveal?.layout === "RESERVED") applyReservedLayout(input.content);
      await applySurfaceContent(reveal ? revealedBubbleContent(revealChunks, revealedCount) : input.content);
      await primeStyleImages(activeStyle, styleImageResolver, surface);
      createStyleLoops(activeStyle, styleImageResolver, surface);
      let currentAnimationMode = "idle";
      let closed = false;
      let transitionTail = Promise.resolve();
      const renderVisibleText = async () => {
        if (!surface) return;
        const visible = reveal ? revealedBubbleContent(revealChunks, revealedCount) : currentContent;
        await applySurfaceContent(visible);
        await surface.show();
      };
      const stopRevealTimer = () => {
        revealGeneration += 1;
        if (revealTimer !== void 0) scheduler.clearTimeout(revealTimer);
        revealTimer = void 0;
      };
      const advanceReveal = async () => {
        if (!reveal || revealedCount >= revealChunks.length) return false;
        revealedCount += 1;
        await renderVisibleText();
        await playAudio(reveal.sound ?? activeStyle.audio?.reveal);
        if (revealedCount >= revealChunks.length) stopRevealTimer();
        return true;
      };
      const scheduleReveal = () => {
        if (!reveal || reveal.intervalSeconds <= 0 || revealedCount >= revealChunks.length) return;
        const expectedGeneration = revealGeneration;
        revealTimer = scheduler.setTimeout(() => {
          revealTimer = void 0;
          if (closed || expectedGeneration !== revealGeneration) return;
          transitionTail = transitionTail.then(() => advanceReveal()).then(() => scheduleReveal());
        }, reveal.intervalSeconds * 1e3);
      };
      const applyAnimationMode = async (mode) => {
        if (mode === currentAnimationMode) return;
        if (mode === "talking") {
          await indicatorLoop?.stop();
          await surface?.setLayerVisible("continueIndicator", false);
          await surface?.setLayerVisible("portraitLipSync", lipSyncLoop !== void 0);
          await lipSyncLoop?.start({ primed: true });
        } else if (mode === "awaiting-continue") {
          await lipSyncLoop?.stop({ reset: true });
          await surface?.setLayerVisible("portraitLipSync", false);
          await surface?.setLayerVisible("continueIndicator", indicatorLoop !== void 0);
          await indicatorLoop?.start({ primed: true });
        } else {
          await Promise.all([lipSyncLoop?.stop({ reset: true }), indicatorLoop?.stop()]);
          await Promise.all([surface?.setLayerVisible("portraitLipSync", false), surface?.setLayerVisible("continueIndicator", false)]);
        }
        currentAnimationMode = mode;
      };
      await Promise.all([
        surface.setLayerVisible("portraitBase", activeStyle.portrait !== void 0),
        surface.setLayerVisible("portraitBlink", activeStyle.portrait?.blink !== void 0),
        surface.setLayerVisible("portraitLipSync", false),
        surface.setLayerVisible("continueIndicator", false)
      ]);
      await surface.show();
      surfaceVisible = true;
      await playAudio(activeStyle.audio?.voice);
      if (reveal !== void 0) await playAudio(reveal.sound ?? activeStyle.audio?.reveal);
      await blinkLoop?.start({ primed: true });
      await applyAnimationMode(input.animationMode);
      const handle = Object.freeze({
        actorKey: input.actorKey,
        kind: input.kind,
        get animationMode() {
          return currentAnimationMode;
        },
        setText(text) {
          if (closed) return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-005", `Bubble is already closed: ${input.actorKey}`));
          let nextContent;
          try {
            nextContent = normalizeBubbleContent(text);
          } catch (error) {
            return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-001", error instanceof Error ? error.message : "Bubble text is invalid."));
          }
          transitionTail = transitionTail.then(async () => {
            if (!surface) return;
            stopRevealTimer();
            currentContent = nextContent;
            if (reveal) {
              revealChunks = splitContentForReveal(nextContent, reveal, activeStyle.textStyle, textCapability);
              revealedCount = Math.min(1, revealChunks.length);
              if (reveal.layout === "RESERVED") applyReservedLayout(nextContent);
              await renderVisibleText();
              scheduleReveal();
            } else await renderVisibleText();
          });
          return transitionTail;
        },
        updateStyle(styleInput) {
          if (closed) return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-005", `Bubble is already closed: ${input.actorKey}`));
          let nextStyle;
          try {
            nextStyle = normalizeStyle(styleInput);
          } catch (error) {
            return Promise.reject(error);
          }
          transitionTail = transitionTail.then(async () => {
            if (!surface) return;
            validateSurface(surface, nextStyle);
            const nextImageResolver = resolveStyleImageCapability(nextStyle);
            for (const audioAsset of [
              nextStyle.audio?.voice,
              nextStyle.audio?.reveal,
              nextStyle.audio?.finish,
              nextStyle.reveal?.sound
            ]) if (audioAsset !== void 0) requireAudioAsset(audio, audioAsset);
            await Promise.all([
              blinkLoop?.stop(),
              lipSyncLoop?.stop(),
              indicatorLoop?.stop()
            ]);
            await primeStyleImages(nextStyle, nextImageResolver, surface);
            await surface.updateStyle(nextStyle);
            activeStyle = nextStyle;
            reveal = nextStyle.reveal;
            revealChunks = reveal ? splitContentForReveal(currentContent, reveal, nextStyle.textStyle, textCapability) : Object.freeze([currentContent]);
            revealedCount = reveal ? Math.min(1, revealChunks.length) : 1;
            stopRevealTimer();
            if (reveal?.layout === "RESERVED") applyReservedLayout(currentContent, nextStyle);
            await applySurfaceContent(currentContent, nextStyle);
            createStyleLoops(nextStyle, nextImageResolver, surface);
            await Promise.all([
              surface.setLayerVisible("portraitBase", nextStyle.portrait !== void 0),
              surface.setLayerVisible("portraitBlink", nextStyle.portrait?.blink !== void 0),
              surface.setLayerVisible("portraitLipSync", false),
              surface.setLayerVisible("continueIndicator", false)
            ]);
            const previousMode = currentAnimationMode;
            currentAnimationMode = "idle";
            await blinkLoop?.start({ primed: true });
            await applyAnimationMode(previousMode);
            await renderVisibleText();
            scheduleReveal();
            await playAudio(activeStyle.audio?.voice);
          });
          return transitionTail;
        },
        setAnimationMode(mode) {
          if (closed) return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-005", `Bubble is already closed: ${input.actorKey}`));
          if (!validAnimationModes$1.has(mode)) return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Bubble animation mode is invalid."));
          transitionTail = transitionTail.then(() => applyAnimationMode(mode));
          return transitionTail;
        },
        revealNext() {
          if (closed) return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-005", `Bubble is already closed: ${input.actorKey}`));
          let advanced = false;
          transitionTail = transitionTail.then(async () => {
            advanced = await advanceReveal();
            if (advanced) scheduleReveal();
          });
          return transitionTail.then(() => advanced);
        },
        revealAll() {
          if (closed) return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-005", `Bubble is already closed: ${input.actorKey}`));
          transitionTail = transitionTail.then(async () => {
            stopRevealTimer();
            if (!reveal) return;
            while (await advanceReveal());
          });
          return transitionTail;
        },
        finish(finishInput = {}) {
          if (closed) return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-005", `Bubble is already closed: ${input.actorKey}`));
          const timeoutSeconds = finishInput.timeoutSeconds ?? 0;
          if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0) return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Bubble finish timeoutSeconds must be zero or greater."));
          if (finishInput.condition !== void 0 && typeof finishInput.condition !== "function") return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-001", "Bubble finish condition must be a function."));
          transitionTail = transitionTail.then(async () => {
            stopRevealTimer();
            if (finishInput.unit !== void 0) {
              reveal = normalizeBubbleReveal({
                ...reveal ?? {},
                unit: finishInput.unit
              });
              revealChunks = splitContentForReveal(currentContent, reveal, activeStyle.textStyle, textCapability);
              revealedCount = Math.min(1, revealChunks.length);
              if (reveal.layout === "RESERVED" && surface) applyReservedLayout(currentContent);
            }
            if (reveal) while (await advanceReveal());
            const condition = finishInput.condition;
            if (condition === void 0 && timeoutSeconds === 0) {
              await playAudio(activeStyle.audio?.finish);
              return;
            }
            await new Promise((resolve, reject) => {
              let settled = false;
              let timeoutHandle;
              let pollHandle;
              const settle = () => {
                if (settled) return;
                settled = true;
                if (timeoutHandle !== void 0) scheduler.clearTimeout(timeoutHandle);
                if (pollHandle !== void 0) scheduler.clearTimeout(pollHandle);
                playAudio(activeStyle.audio?.finish).then(resolve, reject);
              };
              if (timeoutSeconds > 0) timeoutHandle = scheduler.setTimeout(settle, timeoutSeconds * 1e3);
              if (!condition) return;
              const poll = () => {
                let result;
                try {
                  result = condition();
                } catch (error) {
                  if (!settled) {
                    settled = true;
                    if (timeoutHandle !== void 0) scheduler.clearTimeout(timeoutHandle);
                    if (pollHandle !== void 0) scheduler.clearTimeout(pollHandle);
                    reject(error);
                  }
                  return;
                }
                Promise.resolve(result).then((done) => {
                  if (done) settle();
                  else if (!settled) pollHandle = scheduler.setTimeout(poll, 16);
                }, (error) => {
                  if (!settled) {
                    settled = true;
                    if (timeoutHandle !== void 0) scheduler.clearTimeout(timeoutHandle);
                    if (pollHandle !== void 0) scheduler.clearTimeout(pollHandle);
                    reject(error);
                  }
                });
              };
              poll();
            });
          });
          return transitionTail;
        },
        animate(motion) {
          if (closed) return Promise.reject(new BubbleCompositionError("BUBBLE-COMPOSITION-005", `Bubble is already closed: ${input.actorKey}`));
          let normalized;
          try {
            normalized = normalizeMotion(motion, "Bubble motion");
          } catch (error) {
            return Promise.reject(error);
          }
          transitionTail = transitionTail.then(async () => {
            if (normalized.name === "animateBubbleShape" && normalized.visualStyle) {
              const transitionStyle = Object.freeze({
                ...activeStyle,
                layoutProfile: "custom"
              });
              const nextStyle = Object.freeze({
                ...transitionStyle,
                visualStyle: normalized.visualStyle
              });
              if (activeStyle.layoutProfile === "scratch-default") {
                await surface?.updateStyle(transitionStyle);
                await applySurfaceContent(currentContent, transitionStyle);
                await surface?.show();
              }
              await surface?.animate?.(normalized);
              activeStyle = nextStyle;
              await surface?.updateStyle(activeStyle);
              return;
            }
            await surface?.animate?.(normalized);
          });
          return transitionTail;
        },
        async close() {
          if (closed) return;
          closed = true;
          const errors = [];
          stopRevealTimer();
          try {
            await transitionTail;
          } catch (error) {
            errors.push(error);
          }
          for (const operation of [
            () => activeStyle.hideAnimation === void 0 ? void 0 : surface?.animate?.(activeStyle.hideAnimation),
            () => blinkLoop?.stop(),
            () => lipSyncLoop?.stop(),
            () => indicatorLoop?.stop(),
            async () => {
              if (surfaceVisible) await surface?.hide();
            },
            async () => {
              if (textOwned && surface) textCapability.releaseTarget(surface.targets.text);
            },
            async () => surface?.dispose()
          ]) try {
            await operation();
          } catch (error) {
            errors.push(error);
          }
          if (active.get(input.actorKey) === handle) active.delete(input.actorKey);
          aggregateErrors(errors, `Failed to close bubble: ${input.actorKey}`);
        }
      });
      active.set(input.actorKey, handle);
      scheduleReveal();
      if (activeStyle.showAnimation !== void 0) await handle.animate(activeStyle.showAnimation);
      return handle;
    } catch (error) {
      active.delete(input.actorKey);
      const cleanupErrors = [];
      const loopResults = await Promise.allSettled([
        blinkLoop?.stop(),
        lipSyncLoop?.stop(),
        indicatorLoop?.stop()
      ]);
      cleanupErrors.push(...loopResults.flatMap((result) => result.status === "rejected" ? [result.reason] : []));
      if (surfaceVisible && surface) try {
        await surface.hide();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (textOwned && surface) try {
        textCapability.releaseTarget(surface.targets.text);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (surface) try {
        await surface.dispose();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], `Failed to show and clean up bubble: ${input.actorKey}`, { cause: error });
      throw error;
    }
  };
  return Object.freeze({
    defineStyle(input) {
      ensureActive();
      const style = normalizeStyle(input);
      styles.set(style.name, style);
    },
    hasActiveBubble(actorKey) {
      return active.has(requireName$1(actorKey, "Bubble actor key"));
    },
    async show(input) {
      ensureActive();
      const normalized = normalizeShowInput(input);
      return enqueueActor(normalized.actorKey, () => showNow(normalized));
    },
    releaseTarget(actorKey) {
      ensureActive();
      const normalized = requireName$1(actorKey, "Bubble actor key");
      return enqueueActor(normalized, async () => {
        await active.get(normalized)?.close();
      });
    },
    async releaseAll() {
      ensureActive();
      await Promise.allSettled([...actorQueues.values()]);
      aggregateErrors((await Promise.allSettled([...active.values()].map((handle) => handle.close()))).flatMap((result) => result.status === "rejected" ? [result.reason] : []), "Failed to release all bubbles");
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await Promise.allSettled([...actorQueues.values()]);
      const results = await Promise.allSettled([...active.values()].map((handle) => handle.close()));
      styles.clear();
      aggregateErrors(results.flatMap((result) => result.status === "rejected" ? [result.reason] : []), "Failed to dispose bubble composition");
    }
  });
}
//#endregion
//#region node_modules/.pnpm/@kubohiroya+turbowarp-svg-text@0.17.0/node_modules/@kubohiroya/turbowarp-svg-text/dist/composition.js
var block_definitions_default = {
  extensionName: "SVG Text",
  blocks: [{
    "opcode": "defineStyle",
    "blockType": "COMMAND",
    "text": "define text style [STYLE] background [BACKGROUND] text [TEXT_COLOR] font [FONT] size [SIZE] align [ALIGN]",
    "description": "Defines or replaces a named text style for SVG text actors. Bubble shape and placement are owned by the host Bubble layer.",
    "arguments": {
      "STYLE": {
        "type": "STRING",
        "defaultValue": "default"
      },
      "BACKGROUND": {
        "type": "COLOR",
        "defaultValue": "#ffffff"
      },
      "TEXT_COLOR": {
        "type": "COLOR",
        "defaultValue": "#575e75"
      },
      "FONT": {
        "type": "STRING",
        "defaultValue": "Helvetica"
      },
      "SIZE": {
        "type": "NUMBER",
        "defaultValue": 100
      },
      "ALIGN": {
        "type": "STRING",
        "defaultValue": "left",
        "menu": "alignment"
      }
    }
  }, {
    "opcode": "setText",
    "blockType": "COMMAND",
    "text": "set this sprite text [TEXT] with style [STYLE]",
    "description": "Replaces this sprite's skin with responsive styled SVG text.",
    "arguments": {
      "TEXT": {
        "type": "STRING",
        "defaultValue": "Title\\nSubtitle"
      },
      "STYLE": {
        "type": "STRING",
        "defaultValue": "default"
      }
    }
  }],
  menus: { "alignment": {
    "acceptReporters": true,
    "items": [
      "left",
      "center",
      "right"
    ]
  } }
};
var block_editor_fixed_inputs_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://kubohiroya.github.io/turbowarp-svg-text/schemas/block-editor-fixed-inputs.schema.json",
  title: "turbowarp-svg-text fixed editing contracts",
  $defs: { "defineStyle": {
    "type": "object",
    "properties": {
      "BACKGROUND": {
        "type": "string",
        "pattern": "^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
        "description": "New native colour_picker candidate only. Common host commit485f0e550e622235624b5e9176820161aeeba252 src/turbowarp/fixed-fields.js restricts new candidates to 3/6-digit hex; the existing runtime also accepts #4/#8, transparent and CSS colours."
      },
      "TEXT_COLOR": {
        "type": "string",
        "pattern": "^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
        "description": "New native colour_picker candidate only. Common host commit485f0e550e622235624b5e9176820161aeeba252 src/turbowarp/fixed-fields.js restricts new candidates to 3/6-digit hex; the existing runtime also accepts #4/#8, transparent and CSS colours."
      },
      "SIZE": { "type": "number" },
      "ALIGN": {
        "type": "string",
        "enum": [
          "left",
          "center",
          "right"
        ]
      }
    },
    "additionalProperties": false
  } },
  description: "Fixed editing contract for changed standard native fields, not the complete runtime input domain. Colour candidates intersect the common host #RGB/#RRGGBB allowlist with owner validity; existing broader colour raw values are retained unchanged."
};
var extensionConfig = {
  id: "kubohiroyasvgtext",
  slug: "svg-text",
  name: "SVG Text",
  description: "Responsive named-style SVG text actors for TurboWarp.",
  author: "Hiroya Kubo",
  license: "MPL-2.0",
  unsandboxed: true,
  blockIconURI: `data:image/svg+xml,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><text x=\"21\" y=\"38\" font-family=\"system-ui, sans-serif\" font-size=\"30\" font-weight=\"700\" text-anchor=\"middle\" fill=\"#4C97FF\">A</text><g fill=\"#59C059\"><circle cx=\"31\" cy=\"13\" r=\"2.6\"/><circle cx=\"39\" cy=\"13\" r=\"2.6\"/></g></svg>")}`
};
var contracts = block_editor_fixed_inputs_schema_default.$defs;
var repository = "turbowarp-svg-text";
var canonicalSource = {
  repository,
  path: "schemas/block-editor-fixed-inputs.schema.json"
};
var contractRevision = "fixed-inputs-v1";
var numberToken = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;
/** New input only: never run this strict lexical policy over unmodified raw fields. */
function fixedNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !numberToken.test(value.trim())) throw new TypeError("Invalid fixed number.");
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError("Invalid fixed number.");
  return number;
}
function existingNumber(value) {
  if (typeof value !== "string" && typeof value !== "number") throw new TypeError("Invalid numeric projection.");
  if (typeof value === "string" && value.trim() === "") throw new TypeError("Unprojected existing numeric field.");
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError("Invalid numeric projection.");
  return number;
}
function normalizeChoice(opcode, argument, value) {
  return value.trim().toLowerCase();
}
function bundle(opcode, argument) {
  const source = {
    ...canonicalSource,
    symbol: `/$defs/${opcode}/properties/${argument}`
  };
  return {
    identity: {
      ownerId: repository,
      contractId: `${opcode}.${argument}`,
      revision: contractRevision,
      variantId: "fixed"
    },
    dialect: "draft-07",
    root: {
      retrievalUri: `${block_editor_fixed_inputs_schema_default.$id}?binding=${opcode}.${argument}`,
      document: contracts[opcode].properties[argument],
      artifact: {
        role: "canonical-schema",
        source
      }
    },
    resources: [],
    provenance: {
      canonicalSources: [
        source,
        {
          repository,
          path: "src/fixed-input-editors.ts",
          symbol: "fixedInputEditorOptions"
        },
        {
          repository: "turbowarp-extension-data-editor",
          path: "src/turbowarp/fixed-fields.js",
          version: "485f0e550e622235624b5e9176820161aeeba252",
          symbol: "prepareFixedChange"
        },
        {
          repository,
          path: "src/block-definitions.json"
        },
        {
          repository,
          path: "src/extension.ts",
          symbol: opcode
        }
      ],
      generatedFiles: [],
      referenceSchemas: [],
      generationSources: []
    }
  };
}
function fixedInputEditorOptions() {
  return Object.entries(contracts).map(([opcode, contract]) => {
    const bindings = Object.entries(contract.properties).map(([argument, schema]) => ({
      argument,
      schemaBundle: bundle(opcode, argument),
      control: schema.enum ? {
        kind: "enum",
        choices: schema.enum.map((value) => ({
          value,
          label: value
        }))
      } : { kind: schema.type === "number" || schema.type === "integer" ? "number" : "color" },
      read(value) {
        if (schema.type === "number" || schema.type === "integer") return existingNumber(value);
        if (typeof value !== "string") throw new TypeError("Invalid string projection.");
        return schema.enum ? normalizeChoice(opcode, argument, value) : value;
      },
      encode(value) {
        if (schema.type === "number" || schema.type === "integer") {
          fixedNumber(value);
          return typeof value === "number" ? Object.is(value, -0) ? "-0" : String(value) : value.trim();
        }
        if (typeof value !== "string") throw new TypeError("Invalid fixed string.");
        if (schema.pattern && /^#[\da-f]{3}$/iu.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
        return value;
      },
      validateCandidate(candidate) {
        let valid;
        try {
          if (schema.type === "number" || schema.type === "integer") {
            const number = existingNumber(candidate);
            valid = (schema.type !== "integer" || Number.isInteger(number)) && (schema.minimum === void 0 || number >= schema.minimum) && (schema.maximum === void 0 || number <= schema.maximum) && (schema.exclusiveMinimum === void 0 || number > schema.exclusiveMinimum);
          } else valid = typeof candidate === "string" && (schema.enum ? schema.enum.includes(candidate) : new RegExp(schema.pattern, "u").test(candidate));
        } catch {
          valid = false;
        }
        return valid ? [] : [{
          path: argument,
          message: "Check this value before saving."
        }];
      }
    }));
    return {
      apiVersion: 1,
      extensionId: extensionConfig.id,
      editorId: `${extensionConfig.id}.fixed.${opcode}`,
      opcodes: [`${extensionConfig.id}_${opcode}`],
      contractId: `${repository}.${opcode}.fixed`,
      contractRevision,
      bindings,
      validationContext: () => ({
        consumerId: repository,
        nowMs: 0,
        settings: null
      })
    };
  });
}
/** Optional GUI capability; ordinary runtime/composition consumers do not load the editor. */
function registerFixedInputEditors(scratch, runtime) {
  const api = scratch.gui?.blockEditors;
  if (api?.apiVersion !== 1 || typeof api.registerFixedInputEditor !== "function") return void 0;
  const events = runtime;
  const definitions = fixedInputEditorOptions();
  const removers = [];
  let state = "registered";
  const release = () => {
    for (const remove of removers.splice(0).reverse()) remove();
  };
  const register = () => {
    try {
      for (const options of definitions) removers.push(api.registerFixedInputEditor.call(api, options));
    } catch (error) {
      release();
      throw error;
    }
  };
  const releaseForRuntimeDispose = () => {
    if (state !== "registered") return;
    state = "released";
    release();
  };
  const restoreAfterProjectLoad = () => {
    if (state !== "released") return;
    register();
    state = "registered";
  };
  const dispose = () => {
    if (state === "disposed") return;
    state = "disposed";
    events.off?.("RUNTIME_DISPOSED", releaseForRuntimeDispose);
    events.off?.("PROJECT_LOADED", restoreAfterProjectLoad);
    release();
  };
  register();
  events.on?.("RUNTIME_DISPOSED", releaseForRuntimeDispose);
  events.on?.("PROJECT_LOADED", restoreAfterProjectLoad);
  return dispose;
}
var baseStageWidth = 480;
var baseStageHeight = 360;
var defaultFontPercent$1 = 100;
var defaultRubyFontPercent$1 = 50;
var defaultRubyGap$1 = 1;
var maximumFontNameLength = 128;
var textStyle = {
  fontSize: 14,
  lineHeight: 16,
  padding: 12,
  cornerRadius: 8
};
var DEFAULT_SVG_TEXT_STYLE = Object.freeze({
  alignment: "left",
  backgroundColor: "#ffffff",
  font: "Helvetica",
  fontPercent: defaultFontPercent$1,
  textColor: "#575e75"
});
var DEFAULT_SVG_TEXT_RICH_STYLE = Object.freeze({
  ...DEFAULT_SVG_TEXT_STYLE,
  rubyFontPercent: defaultRubyFontPercent$1,
  rubyGap: defaultRubyGap$1
});
function createSvgTextLayout(text, definition, nativeSize) {
  const metrics = createTextMetrics(definition, nativeSize);
  const lineMeasurements = text.split("\n").map((line) => ({
    text: line,
    width: measureTextWidth(line, metrics.fontSize)
  }));
  const contentWidth = Math.max(1, ...lineMeasurements.map((line) => line.width));
  const width = Math.max(1, Math.ceil(contentWidth + metrics.padding * 2));
  const height = Math.max(1, Math.ceil(metrics.lineHeight * lineMeasurements.length + metrics.padding * 2));
  const x = definition.alignment === "center" ? width / 2 : definition.alignment === "right" ? width - metrics.padding : metrics.padding;
  const lines = Object.freeze(lineMeasurements.map((line, index) => Object.freeze({
    baseline: metrics.padding + metrics.fontSize + metrics.lineHeight * index,
    text: line.text,
    width: line.width,
    x
  })));
  const style = createLayoutStyle(definition, metrics);
  return Object.freeze({
    height,
    lines,
    preserveWhitespace: true,
    style,
    width
  });
}
function createSvgTextRichLayout(runs, definition, nativeSize, maxWidth) {
  const metrics = createTextMetrics(definition, nativeSize);
  const rubyFontSize = metrics.fontSize * (definition.rubyFontPercent / defaultFontPercent$1);
  const rubyGap = definition.rubyGap * metrics.fontScale;
  const style = Object.freeze({
    ...createLayoutStyle(definition, metrics),
    rubyFontPercent: definition.rubyFontPercent,
    rubyFontSize,
    rubyGap
  });
  const plainText = runs.map((run) => run.type === "ruby" ? run.base : run.text).join("");
  const readingText = runs.map((run) => run.type === "ruby" ? run.reading : run.text).join("");
  const revealUnits = [];
  const items = [];
  for (const [runIndex, run] of runs.entries()) {
    if (run.type === "ruby") {
      const reveal = Object.freeze({
        end: run.base.length,
        index: revealUnits.length,
        runIndex,
        start: 0,
        type: "ruby"
      });
      revealUnits.push(reveal);
      const baseWidth = measureTextWidth(run.base, metrics.fontSize);
      const readingWidth = measureTextWidth(run.reading, rubyFontSize);
      items.push({
        base: run.base,
        baseWidth,
        reading: run.reading,
        readingWidth,
        reveal,
        type: "ruby",
        width: Math.max(baseWidth, readingWidth)
      });
      continue;
    }
    for (const grapheme of segmentGraphemes(run.text)) {
      if (grapheme.segment === "\n") {
        items.push("break");
        continue;
      }
      const reveal = Object.freeze({
        end: grapheme.end,
        index: revealUnits.length,
        runIndex,
        start: grapheme.start,
        type: "text"
      });
      revealUnits.push(reveal);
      items.push({
        reveal,
        text: grapheme.segment,
        type: "text",
        width: measureTextWidth(grapheme.segment, metrics.fontSize)
      });
    }
  }
  const contentLimit = maxWidth === void 0 ? void 0 : Math.max(1, maxWidth - metrics.padding * 2);
  const pendingLines = [];
  let pendingLine = {
    units: [],
    width: 0
  };
  const finishLine = () => {
    pendingLines.push(pendingLine);
    pendingLine = {
      units: [],
      width: 0
    };
  };
  for (const item of items) {
    if (item === "break") {
      finishLine();
      continue;
    }
    if (contentLimit !== void 0 && pendingLine.units.length > 0 && pendingLine.width + item.width > contentLimit) finishLine();
    pendingLine.units.push(item);
    pendingLine.width += item.width;
  }
  finishLine();
  const naturalWidth = Math.max(1, ...pendingLines.map((line) => line.width)) + metrics.padding * 2;
  const width = Math.max(1, Math.ceil(maxWidth === void 0 ? naturalWidth : Math.max(maxWidth, naturalWidth)));
  const baseDescent = Math.max(0, metrics.lineHeight - metrics.fontSize);
  let lineTop = metrics.padding;
  const lines = Object.freeze(pendingLines.map((pending) => {
    const hasRuby = pending.units.some((unit) => unit.type === "ruby");
    const ascent = metrics.fontSize + (hasRuby ? rubyFontSize + rubyGap : 0);
    const descent = baseDescent;
    const height = ascent + descent;
    const baseline = lineTop + ascent;
    const x = definition.alignment === "center" ? (width - pending.width) / 2 : definition.alignment === "right" ? width - metrics.padding - pending.width : metrics.padding;
    let fragmentX = x;
    const fragments = Object.freeze(pending.units.map((unit) => {
      if (unit.type === "text") {
        const fragment = Object.freeze({
          baseline,
          revealIndex: unit.reveal.index,
          text: unit.text,
          type: "text",
          width: unit.width,
          x: fragmentX
        });
        fragmentX += unit.width;
        return fragment;
      }
      const groupX = fragmentX;
      const base = Object.freeze({
        baseline,
        fontSize: metrics.fontSize,
        text: unit.base,
        width: unit.baseWidth,
        x: groupX + (unit.width - unit.baseWidth) / 2
      });
      const reading = Object.freeze({
        baseline: baseline - metrics.fontSize - rubyGap,
        fontSize: rubyFontSize,
        text: unit.reading,
        width: unit.readingWidth,
        x: groupX + (unit.width - unit.readingWidth) / 2
      });
      const fragment = Object.freeze({
        base,
        reading,
        revealIndex: unit.reveal.index,
        type: "ruby",
        width: unit.width,
        x: groupX
      });
      fragmentX += unit.width;
      return fragment;
    }));
    const line = Object.freeze({
      ascent,
      baseline,
      descent,
      fragments,
      height,
      overflow: contentLimit !== void 0 && pending.width > contentLimit,
      width: pending.width,
      x
    });
    lineTop += height;
    return line;
  }));
  const height = Math.max(1, Math.ceil(lineTop + metrics.padding));
  const overflow = lines.some((line) => line.overflow);
  return Object.freeze({
    height,
    lines,
    overflow,
    plainText,
    preserveWhitespace: true,
    readingText,
    revealUnits: Object.freeze(revealUnits),
    style,
    width
  });
}
function renderSvgTextLayout(layout) {
  const textAnchor = layout.style.alignment === "center" ? "middle" : layout.style.alignment === "right" ? "end" : "start";
  const text = layout.lines.map((line) => line.text).join("\n");
  const tspans = layout.lines.map((line) => `<tspan x="${formatSvgNumber(line.x)}" y="${formatSvgNumber(line.baseline)}">${escapeXml(line.text)}</tspan>`).join("");
  const whitespaceAttribute = layout.preserveWhitespace ? " xml:space=\"preserve\"" : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img"><title>${escapeXml(text)}</title><rect width="${layout.width}" height="${layout.height}" rx="${formatSvgNumber(layout.style.cornerRadius)}" fill="${escapeXml(layout.style.backgroundColor)}"/><text${whitespaceAttribute} fill="${escapeXml(layout.style.textColor)}" font-family="${escapeXml(layout.style.font)}" font-size="${formatSvgNumber(layout.style.fontSize)}" text-anchor="${textAnchor}">${tspans}</text></svg>`;
}
function renderSvgTextRichLayout(layout) {
  const tspans = layout.lines.flatMap((line) => line.fragments.flatMap((fragment) => {
    if (fragment.type === "text") return [`<tspan x="${formatSvgNumber(fragment.x)}" y="${formatSvgNumber(fragment.baseline)}" font-size="${formatSvgNumber(layout.style.fontSize)}">${escapeXml(fragment.text)}</tspan>`];
    return [`<tspan x="${formatSvgNumber(fragment.reading.x)}" y="${formatSvgNumber(fragment.reading.baseline)}" font-size="${formatSvgNumber(fragment.reading.fontSize)}">${escapeXml(fragment.reading.text)}</tspan>`, `<tspan x="${formatSvgNumber(fragment.base.x)}" y="${formatSvgNumber(fragment.base.baseline)}" font-size="${formatSvgNumber(fragment.base.fontSize)}">${escapeXml(fragment.base.text)}</tspan>`];
  })).join("");
  const whitespaceAttribute = layout.preserveWhitespace ? " xml:space=\"preserve\"" : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img"><title>${escapeXml(layout.plainText)}</title><rect width="${layout.width}" height="${layout.height}" rx="${formatSvgNumber(layout.style.cornerRadius)}" fill="${escapeXml(layout.style.backgroundColor)}"/><text${whitespaceAttribute} fill="${escapeXml(layout.style.textColor)}" font-family="${escapeXml(layout.style.font)}" text-anchor="start">${tspans}</text></svg>`;
}
function normalizeSvgTextColor(value, fallback) {
  const color = value.trim();
  if (color === "") return fallback;
  if (color.toLowerCase() === "transparent") return color;
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu.test(color)) return color;
  if (globalThis.CSS?.supports?.("color", color)) return color;
  return fallback;
}
function normalizeSvgTextFont(value) {
  const font = value.trim();
  const hasUnsafeCharacter = [...font].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 || ",;{}".includes(character);
  });
  if (font === "" || font.length > maximumFontNameLength || hasUnsafeCharacter) return DEFAULT_SVG_TEXT_STYLE.font;
  return font;
}
function createTextMetrics(definition, nativeSize) {
  const stageScale = Math.min(nativeSize[0] / baseStageWidth, nativeSize[1] / baseStageHeight);
  const fontScale = stageScale * (definition.fontPercent / defaultFontPercent$1);
  return {
    cornerRadius: textStyle.cornerRadius * stageScale,
    fontScale,
    fontSize: textStyle.fontSize * fontScale,
    lineHeight: textStyle.lineHeight * fontScale,
    padding: textStyle.padding * stageScale
  };
}
function createLayoutStyle(definition, metrics) {
  return Object.freeze({
    alignment: definition.alignment,
    backgroundColor: definition.backgroundColor,
    cornerRadius: metrics.cornerRadius,
    font: definition.font,
    fontPercent: definition.fontPercent,
    fontSize: metrics.fontSize,
    lineHeight: metrics.lineHeight,
    padding: metrics.padding,
    textColor: definition.textColor
  });
}
function segmentGraphemes(value) {
  const segments = [];
  let current = "";
  let currentStart = 0;
  let joinNext = false;
  let offset = 0;
  for (const character of value) {
    if (!(current !== "" && (joinNext || character === "‍" || isGraphemeExtender(character))) && current !== "") {
      segments.push({
        end: offset,
        segment: current,
        start: currentStart
      });
      current = "";
    }
    if (current === "") currentStart = offset;
    current += character;
    joinNext = character === "‍";
    offset += character.length;
  }
  if (current !== "") segments.push({
    end: offset,
    segment: current,
    start: currentStart
  });
  return segments;
}
function isGraphemeExtender(character) {
  if (/\p{Mark}/u.test(character)) return true;
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint >= 65024 && codePoint <= 65039 || codePoint >= 917760 && codePoint <= 917999 || codePoint >= 127995 && codePoint <= 127999;
}
function measureTextWidth(text, fontSize) {
  let units = 0;
  for (const character of text) {
    if (/\p{Mark}/u.test(character)) continue;
    if (/\s/u.test(character)) {
      units += .35;
      continue;
    }
    const codePoint = character.codePointAt(0) ?? 0;
    units += codePoint <= 127 ? .62 : 1;
  }
  return units * fontSize;
}
function escapeXml(value) {
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      default: return "&apos;";
    }
  });
}
function formatSvgNumber(value) {
  return String(Math.round(value * 1e3) / 1e3);
}
var blockDefinitions$1 = block_definitions_default.blocks;
var definitionMenus$1 = block_definitions_default.menus;
var EXTENSION_DOCS_URI$1 = "https://kubohiroya.github.io/turbowarp-svg-text/";
var defaultStyleName$1 = "default";
var defaultFontPercent = 100;
var defaultRubyFontPercent = 50;
var defaultRubyGap = 1;
var minimumFontPercent = 1;
var maximumFontPercent = 1e3;
var minimumRubyFontPercent = 10;
var maximumRubyFontPercent = 100;
var minimumRubyGap = 0;
var maximumRubyGap = 100;
var BLOCK_ICON_URI$1 = extensionConfig.blockIconURI;
var SvgTextExtension = class {
  constructor(runtime = Scratch.vm?.runtime, options = {}) {
    this.styles = /* @__PURE__ */ new Map([[defaultStyleName$1, DEFAULT_SVG_TEXT_RICH_STYLE]]);
    this.textActors = /* @__PURE__ */ new Map();
    if (!runtime) throw new Error("SVG Text requires the TurboWarp VM.");
    this.runtime = runtime;
    this.castToString = options.castToString ?? Scratch.Cast.toString;
    if (options.listenForRuntimeEvents ?? true) this.runtime.on("STAGE_SIZE_CHANGED", () => {
      this.restyleTextActors();
    });
  }
  getInfo() {
    this.fixedEditorsDispose ?? (this.fixedEditorsDispose = registerFixedInputEditors(Scratch, this.runtime));
    return {
      id: extensionConfig.id,
      name: Scratch.translate(block_definitions_default.extensionName),
      docsURI: EXTENSION_DOCS_URI$1,
      blockIconURI: BLOCK_ICON_URI$1,
      color1: "#9966ff",
      blocks: blockDefinitions$1.map((block) => this.toScratchBlock(block)),
      menus: definitionMenus$1
    };
  }
  defineStyle(args) {
    const styleName = this.normalizeStyleName(args.STYLE);
    this.styles.set(styleName, {
      alignment: this.normalizeAlignment(args.ALIGN),
      backgroundColor: this.normalizeColor(args.BACKGROUND, DEFAULT_SVG_TEXT_STYLE.backgroundColor),
      font: this.normalizeFont(args.FONT),
      fontPercent: this.normalizeFontPercent(args.SIZE),
      rubyFontPercent: this.normalizeRubyFontPercent(args.RUBY_SIZE),
      rubyGap: this.normalizeRubyGap(args.RUBY_GAP),
      textColor: this.normalizeColor(args.TEXT_COLOR, DEFAULT_SVG_TEXT_STYLE.textColor)
    });
    this.restyleTextActors(styleName);
  }
  setText(args, util) {
    this.applyTextActor(util.target, {
      kind: "plain",
      text: this.normalizeMessage(args.TEXT)
    }, this.resolveStyle(args.STYLE));
  }
  measureText(styleName, text) {
    const selection = this.resolveStyle(styleName);
    const layout = createSvgTextLayout(this.normalizeMessage(text), selection.definition, this.getNativeSize());
    return Math.max(0, ...layout.lines.map((line) => line.width));
  }
  /**
  * Exposes the stock named-style registry through a skin-free layout contract.
  * Consumers receive current layout data without access to the mutable registry.
  */
  getLayoutCapability() {
    this.layoutCapabilityValue ?? (this.layoutCapabilityValue = Object.freeze({
      layoutText: (input) => {
        if (typeof input !== "object" || input === null || typeof input.styleName !== "string" || typeof input.text !== "string") throw new TypeError("SVG Text layout capability input is invalid.");
        const nativeSize = this.requireLayoutNativeSize(input.nativeSize);
        const selection = this.resolveStyle(input.styleName);
        return createSvgTextLayout(this.normalizeMessage(input.text), selection.definition, nativeSize);
      },
      layoutRichText: (input) => {
        if (typeof input !== "object" || input === null || typeof input.styleName !== "string") throw new TypeError("SVG Text rich layout capability input is invalid.");
        this.requireLayoutNativeSize(input.nativeSize);
        const selection = this.resolveStyle(input.styleName);
        return layoutRichTextFromStyles(/* @__PURE__ */ new Map([[input.styleName, selection.definition]]), input);
      }
    }));
    return this.layoutCapabilityValue;
  }
  setCompositionText(styleName, render, target) {
    const content = Object.freeze({
      kind: "composition",
      render
    });
    this.applyTextActor(target, content, this.resolveStyle(styleName));
  }
  releaseTextActor(target) {
    const state = this.textActors.get(target);
    if (!state) return false;
    this.textActors.delete(target);
    this.runtime.renderer?.destroySkin?.(state.skinId);
    this.runtime.requestRedraw?.();
    return true;
  }
  toScratchBlock(block) {
    return {
      opcode: block.opcode,
      blockType: Scratch.BlockType[block.blockType],
      text: Scratch.translate(block.text),
      hideFromPalette: block.hideFromPalette ?? false,
      arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, {
        type: Scratch.ArgumentType[argument.type],
        defaultValue: argument.defaultValue,
        ...argument.menu === void 0 ? {} : { menu: argument.menu }
      }]))
    };
  }
  normalizeStyleName(value) {
    return this.castToString(value).trim() || defaultStyleName$1;
  }
  normalizeFontPercent(value) {
    if (typeof value === "string" && value.trim() === "") return defaultFontPercent;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return defaultFontPercent;
    return Math.min(maximumFontPercent, Math.max(minimumFontPercent, numericValue));
  }
  normalizeRubyFontPercent(value) {
    if (typeof value === "string" && value.trim() === "") return defaultRubyFontPercent;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return defaultRubyFontPercent;
    return Math.min(maximumRubyFontPercent, Math.max(minimumRubyFontPercent, numericValue));
  }
  normalizeRubyGap(value) {
    if (typeof value === "string" && value.trim() === "") return defaultRubyGap;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return defaultRubyGap;
    return Math.min(maximumRubyGap, Math.max(minimumRubyGap, numericValue));
  }
  normalizeMessage(value) {
    return this.castToString(value).replace(/\\r\\n|\\n|\\r/gu, "\n");
  }
  normalizeAlignment(value) {
    const alignment = this.castToString(value).trim().toLowerCase();
    if (alignment === "center" || alignment === "right") return alignment;
    return "left";
  }
  normalizeColor(value, fallback) {
    return normalizeSvgTextColor(this.castToString(value), fallback);
  }
  normalizeFont(value) {
    return normalizeSvgTextFont(this.castToString(value));
  }
  getNativeSize() {
    const nativeSize = this.runtime.renderer?.getNativeSize?.();
    if (!Array.isArray(nativeSize) || nativeSize.length < 2) return [480, 360];
    const width = Number(nativeSize[0]);
    const height = Number(nativeSize[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [480, 360];
    return [width, height];
  }
  requireLayoutNativeSize(value) {
    if (!Array.isArray(value) || value.length !== 2 || value.some((dimension) => typeof dimension !== "number" || !Number.isFinite(dimension) || dimension <= 0)) throw new TypeError("SVG Text layout capability nativeSize must contain two positive finite numbers.");
    return value;
  }
  createTextActorSvg(content, definition) {
    if (content.kind === "composition") return content.render(definition, this.getNativeSize());
    return renderSvgTextLayout(createSvgTextLayout(content.text, definition, this.getNativeSize()));
  }
  applyTextActor(target, content, selection) {
    const renderer = this.runtime.renderer;
    if (typeof target.drawableID !== "number" || typeof renderer?.createSVGSkin !== "function" || typeof renderer.updateDrawableSkinId !== "function") throw new Error("SVG Text requires SVG skin APIs from TurboWarp.");
    const skinId = renderer.createSVGSkin(this.createTextActorSvg(content, selection.definition));
    if (!Number.isInteger(skinId) || skinId < 0) throw new Error("TurboWarp did not create an SVG text skin.");
    try {
      renderer.updateDrawableSkinId(target.drawableID, skinId);
    } catch (error) {
      renderer.destroySkin?.(skinId);
      throw error;
    }
    const previous = this.textActors.get(target);
    this.textActors.set(target, {
      content,
      skinId,
      styleName: selection.styleName
    });
    if (previous && previous.skinId !== skinId) renderer.destroySkin?.(previous.skinId);
    this.runtime.requestRedraw?.();
  }
  resolveStyle(value) {
    const requestedName = this.normalizeStyleName(value);
    const definition = this.styles.get(requestedName);
    if (definition) return {
      definition,
      styleName: requestedName
    };
    return {
      definition: this.styles.get(defaultStyleName$1) ?? DEFAULT_SVG_TEXT_RICH_STYLE,
      styleName: defaultStyleName$1
    };
  }
  restyleTextActors(styleName) {
    for (const [target, state] of [...this.textActors]) {
      if (styleName !== void 0 && state.styleName !== styleName) continue;
      this.applyTextActor(target, state.content, this.resolveStyle(state.styleName));
    }
  }
};
var defaultStyleName = "default";
var maximumContentCharacters = 1e5;
var maximumContentLines = 1e3;
var maximumContentRuns = 1024;
var maximumLayoutFragments = 1e4;
var maximumLayoutWidth = 1e5;
var maximumRubyBaseCharacters = 256;
var maximumRubyReadingCharacters = 512;
function isRecord$4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function compositionError(code, message) {
  const error = new Error(message);
  Object.defineProperty(error, "code", { value: code });
  return error;
}
function requireExactKeys(value, required, optional, label) {
  const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) throw compositionError("SVG-TEXT-COMPOSITION-001", `${label} has missing or unknown properties.`);
}
function requireName(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) throw compositionError("SVG-TEXT-COMPOSITION-001", `${label} must be a non-empty string.`);
  return value.trim();
}
function validateRuntime(value) {
  if (!isRecord$4(value) || !isRecord$4(value.renderer)) throw new TypeError("SVG Text composition runtime must provide a renderer.");
  const renderer = value.renderer;
  const methods = [
    "createSVGSkin",
    "destroySkin",
    "updateDrawableSkinId"
  ];
  if (methods.some((method) => typeof renderer[method] !== "function")) throw new TypeError(`SVG Text composition renderer must provide ${methods.join(", ")}.`);
  if (value.requestRedraw !== void 0 && typeof value.requestRedraw !== "function") throw new TypeError("SVG Text composition requestRedraw must be a function.");
  return value;
}
function validateTarget(value) {
  if (!isRecord$4(value) || typeof value.drawableID !== "number" || !Number.isInteger(value.drawableID) || value.drawableID < 0) throw compositionError("SVG-TEXT-COMPOSITION-002", "SVG Text target must provide a non-negative integer drawableID.");
  return value;
}
function validateOptionalString(value, label) {
  if (value !== void 0 && (typeof value !== "string" || value.length === 0)) throw compositionError("SVG-TEXT-COMPOSITION-001", `${label} must be a non-empty string when provided.`);
}
function validateStyle(value) {
  if (!isRecord$4(value)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text style must be an object.");
  requireExactKeys(value, ["name"], [
    "alignment",
    "backgroundColor",
    "font",
    "fontPercent",
    "rubyFontPercent",
    "rubyGap",
    "textColor"
  ], "SVG Text style");
  const name = requireName(value.name, "SVG Text style name");
  if (value.alignment !== void 0 && value.alignment !== "left" && value.alignment !== "center" && value.alignment !== "right") throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text alignment is invalid.");
  validateOptionalString(value.backgroundColor, "SVG Text backgroundColor");
  validateOptionalString(value.font, "SVG Text font");
  validateOptionalString(value.textColor, "SVG Text textColor");
  if (value.fontPercent !== void 0 && (typeof value.fontPercent !== "number" || !Number.isFinite(value.fontPercent) || value.fontPercent < 1 || value.fontPercent > 1e3)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text fontPercent must be a finite number from 1 to 1000.");
  if (value.rubyFontPercent !== void 0 && (typeof value.rubyFontPercent !== "number" || !Number.isFinite(value.rubyFontPercent) || value.rubyFontPercent < 10 || value.rubyFontPercent > 100)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text rubyFontPercent must be a finite number from 10 to 100.");
  if (value.rubyGap !== void 0 && (typeof value.rubyGap !== "number" || !Number.isFinite(value.rubyGap) || value.rubyGap < 0 || value.rubyGap > 100)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text rubyGap must be a finite number from 0 to 100.");
  return {
    ...value,
    name
  };
}
function createStyleDefinition(style) {
  return Object.freeze({
    alignment: style.alignment ?? DEFAULT_SVG_TEXT_STYLE.alignment,
    backgroundColor: normalizeSvgTextColor(style.backgroundColor ?? "", DEFAULT_SVG_TEXT_STYLE.backgroundColor),
    font: normalizeSvgTextFont(style.font ?? ""),
    fontPercent: style.fontPercent ?? DEFAULT_SVG_TEXT_STYLE.fontPercent,
    rubyFontPercent: style.rubyFontPercent ?? DEFAULT_SVG_TEXT_RICH_STYLE.rubyFontPercent,
    rubyGap: style.rubyGap ?? DEFAULT_SVG_TEXT_RICH_STYLE.rubyGap,
    textColor: normalizeSvgTextColor(style.textColor ?? "", DEFAULT_SVG_TEXT_STYLE.textColor)
  });
}
function validateNativeSize(value) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((dimension) => typeof dimension !== "number" || !Number.isFinite(dimension) || dimension <= 0)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text nativeSize must be [width, height] with two positive finite numbers.");
  return value;
}
function getRuntimeNativeSize(renderer) {
  const value = renderer.getNativeSize?.();
  if (!Array.isArray(value) || value.length < 2) return [480, 360];
  const width = Number(value[0]);
  const height = Number(value[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [480, 360];
  return [width, height];
}
function normalizeText(value) {
  return value.replace(/\\r\\n|\\n|\\r/gu, "\n");
}
function normalizeRichText(value) {
  return normalizeText(value.replace(/\r\n?|\n/gu, "\n"));
}
function contentLimitError(message) {
  return compositionError("SVG-TEXT-COMPOSITION-007", message);
}
function validateContentRuns(value) {
  if (!Array.isArray(value)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text rich content runs must be an array.");
  if (value.length > maximumContentRuns) throw contentLimitError(`SVG Text rich content exceeds ${maximumContentRuns} runs.`);
  let characterCount = 0;
  let fragmentCount = 0;
  let lineCount = 1;
  const runs = value.map((candidate, runIndex) => {
    if (!isRecord$4(candidate)) throw compositionError("SVG-TEXT-COMPOSITION-001", `SVG Text rich content run ${runIndex} must be an object.`);
    if (candidate.type === "text") {
      requireExactKeys(candidate, ["type", "text"], [], `SVG Text rich content run ${runIndex}`);
      if (typeof candidate.text !== "string") throw compositionError("SVG-TEXT-COMPOSITION-001", `SVG Text rich content run ${runIndex} text must be a string.`);
      const text = normalizeRichText(candidate.text);
      characterCount += text.length;
      lineCount += text.split("\n").length - 1;
      fragmentCount += [...text.replace(/\n/gu, "")].length;
      return Object.freeze({
        text,
        type: "text"
      });
    }
    if (candidate.type === "ruby") {
      requireExactKeys(candidate, [
        "type",
        "base",
        "reading"
      ], [], `SVG Text rich content run ${runIndex}`);
      if (typeof candidate.base !== "string" || typeof candidate.reading !== "string") throw compositionError("SVG-TEXT-COMPOSITION-001", `SVG Text rich content run ${runIndex} ruby base and reading must be strings.`);
      const base = normalizeRichText(candidate.base);
      const reading = normalizeRichText(candidate.reading);
      if (base.length === 0 || reading.length === 0 || base.includes("\n") || reading.includes("\n")) throw compositionError("SVG-TEXT-COMPOSITION-001", `SVG Text rich content run ${runIndex} ruby base and reading must be non-empty single-line strings.`);
      if (base.length > maximumRubyBaseCharacters) throw contentLimitError(`SVG Text ruby base exceeds ${maximumRubyBaseCharacters} characters.`);
      if (reading.length > maximumRubyReadingCharacters) throw contentLimitError(`SVG Text ruby reading exceeds ${maximumRubyReadingCharacters} characters.`);
      characterCount += base.length + reading.length;
      fragmentCount += 1;
      return Object.freeze({
        base,
        reading,
        type: "ruby"
      });
    }
    throw compositionError("SVG-TEXT-COMPOSITION-001", `SVG Text rich content run ${runIndex} type is invalid.`);
  });
  if (characterCount > maximumContentCharacters) throw contentLimitError(`SVG Text rich content exceeds ${maximumContentCharacters} characters.`);
  if (lineCount > maximumContentLines) throw contentLimitError(`SVG Text rich content exceeds ${maximumContentLines} lines.`);
  if (fragmentCount > maximumLayoutFragments) throw contentLimitError(`SVG Text rich content exceeds ${maximumLayoutFragments} layout fragments.`);
  return Object.freeze(runs);
}
function validateMaxWidth(value) {
  if (value === void 0) return void 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maximumLayoutWidth) throw compositionError("SVG-TEXT-COMPOSITION-001", `SVG Text maxWidth must be a finite number greater than 0 and no greater than ${maximumLayoutWidth}.`);
  return value;
}
function layoutTextFromStyles(styles, input) {
  if (!isRecord$4(input)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text layout input is invalid.");
  requireExactKeys(input, [
    "styleName",
    "text",
    "nativeSize"
  ], [], "SVG Text layout input");
  const styleName = requireName(input.styleName, "SVG Text styleName");
  const definition = styles.get(styleName);
  if (!definition) throw compositionError("SVG-TEXT-COMPOSITION-003", `SVG Text style is not defined: ${styleName}`);
  if (typeof input.text !== "string") throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text text must be a string.");
  return createSvgTextLayout(normalizeText(input.text), definition, validateNativeSize(input.nativeSize));
}
/**
* Lays out content runs, ruby included, with one named style. The composition and the extension's
* layout capability share it, so both validate runs, sizes and limits the same way.
*/
function layoutRichTextFromStyles(styles, input) {
  if (!isRecord$4(input)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text rich layout input is invalid.");
  requireExactKeys(input, [
    "styleName",
    "runs",
    "nativeSize"
  ], ["maxWidth"], "SVG Text rich layout input");
  const styleName = requireName(input.styleName, "SVG Text styleName");
  const definition = styles.get(styleName);
  if (!definition) throw compositionError("SVG-TEXT-COMPOSITION-003", `SVG Text style is not defined: ${styleName}`);
  const runs = validateContentRuns(input.runs);
  const nativeSize = validateNativeSize(input.nativeSize);
  const maxWidth = validateMaxWidth(input.maxWidth);
  return maxWidth === void 0 ? createSvgTextRichLayout(runs, definition, nativeSize) : createSvgTextRichLayout(runs, definition, nativeSize, maxWidth);
}
function createSvgTextLayoutComposition() {
  const styles = /* @__PURE__ */ new Map([[defaultStyleName, DEFAULT_SVG_TEXT_RICH_STYLE]]);
  return Object.freeze({
    defineStyle(input) {
      const style = validateStyle(input);
      styles.set(style.name, createStyleDefinition(style));
    },
    layoutRichText(input) {
      return layoutRichTextFromStyles(styles, input);
    },
    layoutText(input) {
      return layoutTextFromStyles(styles, input);
    }
  });
}
function createSvgTextComposition(options) {
  if (!isRecord$4(options)) throw new TypeError("SVG Text composition options must be an object.");
  const runtime = validateRuntime(options.runtime);
  const extension = new SvgTextExtension(runtime, {
    castToString: (value) => String(value),
    listenForRuntimeEvents: false
  });
  const styles = /* @__PURE__ */ new Map([[defaultStyleName, DEFAULT_SVG_TEXT_RICH_STYLE]]);
  const targets = /* @__PURE__ */ new Set();
  let disposed = false;
  function ensureActive() {
    if (disposed) throw compositionError("SVG-TEXT-COMPOSITION-004", "SVG Text composition has been released.");
  }
  return Object.freeze({
    defineStyle(input) {
      ensureActive();
      const style = validateStyle(input);
      extension.defineStyle({
        ALIGN: style.alignment ?? "",
        BACKGROUND: style.backgroundColor ?? "",
        FONT: style.font ?? "",
        RUBY_GAP: style.rubyGap ?? "",
        RUBY_SIZE: style.rubyFontPercent ?? "",
        SIZE: style.fontPercent ?? "",
        STYLE: style.name,
        TEXT_COLOR: style.textColor ?? ""
      });
      styles.set(style.name, createStyleDefinition(style));
    },
    layoutRichText(input) {
      ensureActive();
      return layoutRichTextFromStyles(styles, input);
    },
    layoutText(input) {
      ensureActive();
      return layoutTextFromStyles(styles, input);
    },
    measureText(input) {
      ensureActive();
      if (!isRecord$4(input)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text measure input is invalid.");
      requireExactKeys(input, ["styleName", "text"], [], "SVG Text measure input");
      const styleName = requireName(input.styleName, "SVG Text styleName");
      if (!styles.has(styleName)) throw compositionError("SVG-TEXT-COMPOSITION-003", `SVG Text style is not defined: ${styleName}`);
      if (typeof input.text !== "string") throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text text must be a string.");
      return extension.measureText(styleName, input.text);
    },
    measureRichText(input) {
      ensureActive();
      if (!isRecord$4(input)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text rich measure input is invalid.");
      requireExactKeys(input, ["styleName", "runs"], ["maxWidth"], "SVG Text rich measure input");
      const styleName = requireName(input.styleName, "SVG Text styleName");
      const definition = styles.get(styleName);
      if (!definition) throw compositionError("SVG-TEXT-COMPOSITION-003", `SVG Text style is not defined: ${styleName}`);
      const runs = validateContentRuns(input.runs);
      const maxWidth = validateMaxWidth(input.maxWidth);
      const nativeSize = getRuntimeNativeSize(runtime.renderer);
      const layout = maxWidth === void 0 ? createSvgTextRichLayout(runs, definition, nativeSize) : createSvgTextRichLayout(runs, definition, nativeSize, maxWidth);
      return Math.max(0, ...layout.lines.map((line) => line.width));
    },
    setRichText(input) {
      ensureActive();
      if (!isRecord$4(input)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text rich actor input is invalid.");
      requireExactKeys(input, [
        "styleName",
        "target",
        "runs"
      ], ["maxWidth"], "SVG Text rich actor input");
      const target = validateTarget(input.target);
      const styleName = requireName(input.styleName, "SVG Text styleName");
      if (!styles.has(styleName)) throw compositionError("SVG-TEXT-COMPOSITION-003", `SVG Text style is not defined: ${styleName}`);
      const runs = validateContentRuns(input.runs);
      const maxWidth = validateMaxWidth(input.maxWidth);
      extension.setCompositionText(styleName, (definition, nativeSize) => {
        return renderSvgTextRichLayout(maxWidth === void 0 ? createSvgTextRichLayout(runs, definition, nativeSize) : createSvgTextRichLayout(runs, definition, nativeSize, maxWidth));
      }, target);
      targets.add(target);
    },
    setText(input) {
      ensureActive();
      if (!isRecord$4(input)) throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text actor input is invalid.");
      requireExactKeys(input, [
        "styleName",
        "target",
        "text"
      ], [], "SVG Text actor input");
      const target = validateTarget(input.target);
      const styleName = requireName(input.styleName, "SVG Text styleName");
      if (!styles.has(styleName)) throw compositionError("SVG-TEXT-COMPOSITION-003", `SVG Text style is not defined: ${styleName}`);
      if (typeof input.text !== "string") throw compositionError("SVG-TEXT-COMPOSITION-001", "SVG Text text must be a string.");
      extension.setText({
        STYLE: styleName,
        TEXT: input.text
      }, { target });
      targets.add(target);
    },
    releaseTarget(value) {
      ensureActive();
      const target = validateTarget(value);
      if (!targets.delete(target)) throw compositionError("SVG-TEXT-COMPOSITION-005", "SVG Text target is not owned by this composition.");
      if (!extension.releaseTextActor(target)) throw compositionError("SVG-TEXT-COMPOSITION-005", "SVG Text target ownership is inconsistent.");
    },
    releaseAll() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const target of targets) try {
        extension.releaseTextActor(target);
      } catch (error) {
        errors.push(error);
      }
      targets.clear();
      styles.clear();
      if (errors.length > 0) {
        const error = compositionError("SVG-TEXT-COMPOSITION-006", "SVG Text composition failed to release one or more skins.");
        Object.defineProperty(error, "errors", { value: Object.freeze([...errors]) });
        throw error;
      }
    }
  });
}
//#endregion
//#region src/turbowarp-svg-text-adapter.ts
function isRecord$3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateExtension(value) {
  if (!isRecord$3(value) || typeof value.setText !== "function" || typeof value.releaseTextActor !== "function") throw new TypeError("TurboWarp-SVG-Text adapter requires setText and releaseTextActor.");
  return value;
}
function validateComposition(value) {
  if (!isRecord$3(value) || typeof value.setText !== "function" || typeof value.releaseTarget !== "function") throw new TypeError("SVG Text composition adapter requires setText and releaseTarget.");
  return value;
}
function validateLayoutComposition(value) {
  if (!isRecord$3(value) || typeof value.layoutText !== "function") throw new TypeError("SVG Text overlay adapter requires the layoutText composition API.");
  return value;
}
function requireFiniteNumber(value, label) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new TypeError(`${label} must be a finite number.`);
  return result;
}
function adaptSvgTextLayout(value) {
  if (!isRecord$3(value) || !isRecord$3(value.style) || !Array.isArray(value.lines)) throw new TypeError("SVG Text layout result is invalid.");
  const style = value.style;
  const alignment = style.alignment;
  if (alignment !== "left" && alignment !== "center" && alignment !== "right") throw new TypeError("SVG Text layout alignment is invalid.");
  const width = requireFiniteNumber(value.width, "SVG Text layout width");
  const height = requireFiniteNumber(value.height, "SVG Text layout height");
  const lines = Object.freeze(value.lines.map((line) => {
    if (!isRecord$3(line) || typeof line.text !== "string") throw new TypeError("SVG Text layout line is invalid.");
    return Object.freeze({
      baseline: requireFiniteNumber(line.baseline, "SVG Text line baseline") - height / 2,
      text: line.text,
      x: requireFiniteNumber(line.x, "SVG Text line x") - width / 2
    });
  }));
  return Object.freeze({
    alignment,
    backgroundColor: String(style.backgroundColor),
    backgroundCornerRadius: requireFiniteNumber(style.cornerRadius, "SVG Text corner radius"),
    fill: String(style.textColor),
    fontFamily: String(style.font),
    fontSize: requireFiniteNumber(style.fontSize, "SVG Text font size"),
    height,
    lineHeight: requireFiniteNumber(style.lineHeight, "SVG Text line height"),
    lines,
    preserveWhitespace: value.preserveWhitespace !== false,
    width
  });
}
function adaptSvgTextRichLayout(value) {
  if (!isRecord$3(value) || !Array.isArray(value.lines)) throw new TypeError("SVG Text rich layout result is invalid.");
  const { lines: _plainLines, ...style } = adaptSvgTextLayout({
    ...value,
    lines: []
  });
  const offsetX = style.width / 2;
  const offsetY = style.height / 2;
  const adaptGlyph = (glyph, label) => {
    if (!isRecord$3(glyph) || typeof glyph.text !== "string") throw new TypeError(`SVG Text ruby ${label} is invalid.`);
    return Object.freeze({
      baseline: requireFiniteNumber(glyph.baseline, `SVG Text ruby ${label} baseline`) - offsetY,
      fontSize: requireFiniteNumber(glyph.fontSize, `SVG Text ruby ${label} font size`),
      text: glyph.text,
      x: requireFiniteNumber(glyph.x, `SVG Text ruby ${label} x`) - offsetX
    });
  };
  const adaptFragment = (fragment) => {
    if (!isRecord$3(fragment)) throw new TypeError("SVG Text rich layout fragment is invalid.");
    if (fragment.type === "ruby") return Object.freeze({
      base: adaptGlyph(fragment.base, "base"),
      reading: adaptGlyph(fragment.reading, "reading"),
      type: "ruby"
    });
    if (fragment.type !== "text" || typeof fragment.text !== "string") throw new TypeError("SVG Text rich layout fragment is invalid.");
    return Object.freeze({
      baseline: requireFiniteNumber(fragment.baseline, "SVG Text fragment baseline") - offsetY,
      text: fragment.text,
      type: "text",
      x: requireFiniteNumber(fragment.x, "SVG Text fragment x") - offsetX
    });
  };
  const lines = Object.freeze(value.lines.map((line) => {
    if (!isRecord$3(line) || !Array.isArray(line.fragments)) throw new TypeError("SVG Text rich layout line is invalid.");
    return Object.freeze({ fragments: Object.freeze(line.fragments.map(adaptFragment)) });
  }));
  return Object.freeze({
    ...style,
    lines
  });
}
/**
* Adapt the TurboWarp-SVG-Text extension to Bubble's host-neutral text
* capability contract.
*/
function createTurboWarpSvgTextCapability(extensionInput) {
  const extension = validateExtension(extensionInput);
  return Object.freeze({
    setText({ styleName, target, text }) {
      extension.setText({
        STYLE: styleName,
        TEXT: text
      }, { target });
    },
    releaseTarget(target) {
      extension.releaseTextActor(target);
    },
    measureText({ styleName, text }) {
      if (typeof extension.measureText !== "function") throw new Error("TurboWarp-SVG-Text does not provide text measurement.");
      return extension.measureText(styleName, text);
    }
  });
}
/**
* Adapt the SVG Text package's composition API to Bubble's text capability.
* This helper keeps the core package independent from SVG Text's target type.
*/
function createSvgTextCompositionCapability(compositionInput) {
  const composition = validateComposition(compositionInput);
  const capability = {
    setText({ styleName, target, text }) {
      composition.setText({
        styleName,
        target,
        text
      });
    },
    releaseTarget(target) {
      composition.releaseTarget(target);
    }
  };
  if (typeof composition.measureText === "function") capability.measureText = ({ styleName, text }) => composition.measureText?.({
    styleName,
    text
  }) ?? 0;
  if (typeof composition.setRichText === "function") capability.setRichText = ({ maxWidth, runs, styleName, target }) => {
    composition.setRichText?.({
      runs,
      styleName,
      target,
      ...maxWidth === void 0 ? {} : { maxWidth }
    });
  };
  if (typeof composition.measureRichText === "function") capability.measureRichText = ({ maxWidth, runs, styleName }) => composition.measureRichText?.({
    runs,
    styleName,
    ...maxWidth === void 0 ? {} : { maxWidth }
  }) ?? 0;
  return Object.freeze(capability);
}
/**
* Adapt SVG Text's host-neutral layout composition to Bubble's SVG overlay.
* The adapter preserves SVG Text's line coordinates without creating skins.
*/
function createSvgTextOverlayTextCapability(compositionInput) {
  const composition = validateLayoutComposition(compositionInput);
  const capability = {
    layoutText({ nativeSize, styleName, text }) {
      return adaptSvgTextLayout(composition.layoutText({
        nativeSize: [nativeSize.width, nativeSize.height],
        styleName,
        text
      }));
    },
    measureText({ nativeSize, styleName, text }) {
      const layout = composition.layoutText({
        nativeSize: [nativeSize.width, nativeSize.height],
        styleName,
        text
      });
      return Math.max(1, ...layout.lines.map((line) => requireFiniteNumber(line.width, "SVG Text line width")));
    }
  };
  if (typeof composition.layoutRichText === "function") capability.layoutRichText = ({ maxWidth, nativeSize, runs, styleName }) => adaptSvgTextRichLayout(composition.layoutRichText?.({
    nativeSize: [nativeSize.width, nativeSize.height],
    runs,
    styleName,
    ...maxWidth === void 0 ? {} : { maxWidth }
  }));
  return Object.freeze(capability);
}
/**
* Adapts the stock SVG Text extension's shared named-style layout registry.
*/
function createTurboWarpSvgTextOverlayTextCapability(extensionInput) {
  if (!isRecord$3(extensionInput) || typeof extensionInput.getLayoutCapability !== "function") throw new TypeError("TurboWarp-SVG-Text overlay adapter requires SVG Text 0.8.1 getLayoutCapability().");
  return createSvgTextOverlayTextCapability(extensionInput.getLayoutCapability());
}
//#endregion
//#region src/asset-manager-image-adapter.ts
var supportedMimeTypes = /* @__PURE__ */ new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp"
]);
function isRecord$2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeMimeType(value) {
  const mimeType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mimeType === "image/jpg" || mimeType === "image/pjpeg") return "image/jpeg";
  if (mimeType === "image/x-png") return "image/png";
  return mimeType;
}
function isSupportedMimeType(value) {
  return supportedMimeTypes.has(normalizeMimeType(value));
}
function requireAssetManagerResource(value) {
  if (!isRecord$2(value) || typeof value.url !== "string" || !value.url.startsWith("blob:") || typeof value.mimeType !== "string" || !isSupportedMimeType(value.mimeType) || typeof value.width !== "number" || !Number.isFinite(value.width) || value.width <= 0 || typeof value.height !== "number" || !Number.isFinite(value.height) || value.height <= 0 || typeof value.release !== "function") throw new TypeError("Asset Manager DOM image resources must provide a supported MIME type, positive intrinsic dimensions, a blob URL, and release().");
  return value;
}
/**
* Adapts Asset Manager's host-neutral DOM resource API to Bubble's SVG overlay contract.
* Asset Manager owns byte validation and SVG sanitization; Bubble owns its capability shape.
*/
function createAssetManagerSvgOverlayImageCapability(capabilityInput) {
  if (!isRecord$2(capabilityInput) || typeof capabilityInput.isRegistered !== "function" || typeof capabilityInput.getMimeType !== "function" || typeof capabilityInput.resolveDOMImageResource !== "function") throw new TypeError("Asset Manager DOM image capability is invalid.");
  const capability = capabilityInput;
  return Object.freeze({
    isRegistered(name) {
      return capability.isRegistered(name) && isSupportedMimeType(capability.getMimeType(name));
    },
    getMimeType(name) {
      return normalizeMimeType(capability.getMimeType(name));
    },
    async resolveImage(name) {
      const declaredMimeType = normalizeMimeType(capability.getMimeType(name));
      if (!capability.isRegistered(name) || !isSupportedMimeType(declaredMimeType)) throw new TypeError("Asset Manager image is not registered with a Bubble-compatible MIME type.");
      const resource = await capability.resolveDOMImageResource(name);
      try {
        requireAssetManagerResource(resource);
        const mimeType = normalizeMimeType(resource.mimeType);
        if (mimeType !== declaredMimeType) throw new TypeError("Asset Manager DOM image resource MIME type changed during resolution.");
        return Object.freeze({
          height: resource.height,
          mimeType,
          src: resource.url,
          width: resource.width,
          release: () => resource.release(),
          ...mimeType === "image/svg+xml" ? { svgSecurity: "sanitized" } : {}
        });
      } catch (error) {
        resource?.release?.();
        throw error;
      }
    }
  });
}
//#endregion
//#region src/surface-motion.ts
function clampMotionProgress(value) {
  return Math.max(0, Math.min(1, value));
}
function easeMotionProgress(value, ease) {
  const progress = clampMotionProgress(value);
  switch (ease) {
    case "linear": return progress;
    case "easeIn": return progress * progress;
    case "easeOut": return 1 - (1 - progress) * (1 - progress);
    case "easeInOut": return progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    default: return progress;
  }
}
/**
* Drive a motion with Bubble's scheduler so tests and non-browser hosts can
* provide deterministic time without requestAnimationFrame.
*/
function runMotionTimeline(scheduler, durationSeconds, onFrame) {
  const durationMilliseconds = Math.max(0, durationSeconds * 1e3);
  if (durationMilliseconds === 0) {
    onFrame(1);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let elapsed = 0;
    let timer;
    const tick = () => {
      const step = Math.min(16, durationMilliseconds - elapsed);
      elapsed += step;
      try {
        onFrame(clampMotionProgress(elapsed / durationMilliseconds));
      } catch (error) {
        if (timer !== void 0) scheduler.clearTimeout(timer);
        reject(error);
        return;
      }
      if (elapsed >= durationMilliseconds) {
        resolve();
        return;
      }
      timer = scheduler.setTimeout(tick, Math.min(16, durationMilliseconds - elapsed));
    };
    timer = scheduler.setTimeout(tick, Math.min(16, durationMilliseconds));
  });
}
//#endregion
//#region src/svg-overlay-surface.ts
var svgNamespace = "http://www.w3.org/2000/svg";
var xmlNamespace = "http://www.w3.org/XML/1998/namespace";
var portraitBoxSize$1 = 96;
var indicatorBoxSize$1 = 18;
var contentGap$1 = 8;
var stageSafeMargin$1 = 16;
var overlayTextTargetMarker = Symbol("BubbleSvgOverlayTextTarget");
var overlayImageTargetMarker = Symbol("BubbleSvgOverlayImageTarget");
var overlaySurfaceSequence = 0;
Object.freeze(["scratch-render", "svg-overlay"]);
function isRecord$1(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readNativeSize(renderer) {
  const raw = renderer.getNativeSize();
  const width = Array.isArray(raw) ? Number(raw[0]) : NaN;
  const height = Array.isArray(raw) ? Number(raw[1]) : NaN;
  return Object.freeze({
    width: width > 0 ? width : 480,
    height: height > 0 ? height : 360
  });
}
function requireFiniteDimension(value, label) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new TypeError(`${label} must be a positive finite number.`);
  return result;
}
function requireSafeColor(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) throw new TypeError(`${label} must be a non-empty color string.`);
  if (/url\s*\(|[<>;]/iu.test(value)) throw new TypeError(`${label} contains a disallowed SVG value.`);
  return value;
}
function requireSafeFontFamily(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /url\s*\(|[<>{};]/iu.test(value)) throw new TypeError("SVG overlay fontFamily is invalid.");
  return value;
}
function normalizeTextLayout(value) {
  if (!isRecord$1(value) || !Array.isArray(value.lines)) throw new TypeError("SVG overlay text layout is invalid.");
  const alignment = value.alignment;
  if (alignment !== "left" && alignment !== "center" && alignment !== "right") throw new TypeError("SVG overlay text alignment is invalid.");
  const fontStyle = value.fontStyle;
  if (fontStyle !== void 0 && fontStyle !== "normal" && fontStyle !== "italic") throw new TypeError("SVG overlay fontStyle is invalid.");
  const fontWeight = value.fontWeight;
  if (fontWeight !== void 0 && fontWeight !== "normal" && fontWeight !== "bold" && (!Number.isFinite(fontWeight) || Number(fontWeight) < 1 || Number(fontWeight) > 1e3)) throw new TypeError("SVG overlay fontWeight is invalid.");
  const lines = Object.freeze(value.lines.map((line) => {
    if (typeof line === "string") return line;
    if (!isRecord$1(line) || typeof line.text !== "string") throw new TypeError("SVG overlay text lines must be strings or positioned line records.");
    const hasX = line.x !== void 0;
    if (hasX !== (line.baseline !== void 0)) throw new TypeError("SVG overlay positioned text lines require both x and baseline.");
    if (hasX && (!Number.isFinite(line.x) || !Number.isFinite(line.baseline))) throw new TypeError("SVG overlay text line coordinates must be finite numbers.");
    return Object.freeze({
      text: line.text,
      ...hasX ? {
        x: Number(line.x),
        baseline: Number(line.baseline)
      } : {}
    });
  }));
  const backgroundColor = value.backgroundColor === void 0 ? void 0 : requireSafeColor(value.backgroundColor, "SVG overlay backgroundColor");
  const backgroundCornerRadius = value.backgroundCornerRadius === void 0 ? void 0 : Number(value.backgroundCornerRadius);
  if (backgroundCornerRadius !== void 0 && (!Number.isFinite(backgroundCornerRadius) || backgroundCornerRadius < 0)) throw new TypeError("SVG overlay backgroundCornerRadius must be a non-negative finite number.");
  const preserveWhitespace = value.preserveWhitespace;
  if (preserveWhitespace !== void 0 && typeof preserveWhitespace !== "boolean") throw new TypeError("SVG overlay preserveWhitespace must be a boolean.");
  return Object.freeze({
    alignment,
    fill: requireSafeColor(value.fill, "SVG overlay text fill"),
    fontFamily: requireSafeFontFamily(value.fontFamily),
    fontSize: requireFiniteDimension(value.fontSize, "SVG overlay fontSize"),
    height: requireFiniteDimension(value.height, "SVG overlay text height"),
    lineHeight: requireFiniteDimension(value.lineHeight, "SVG overlay lineHeight"),
    lines,
    width: requireFiniteDimension(value.width, "SVG overlay text width"),
    ...backgroundColor === void 0 ? {} : { backgroundColor },
    ...backgroundCornerRadius === void 0 ? {} : { backgroundCornerRadius },
    ...fontStyle === void 0 ? {} : { fontStyle },
    ...fontWeight === void 0 ? {} : { fontWeight },
    ...preserveWhitespace === void 0 ? {} : { preserveWhitespace }
  });
}
function requireFiniteCoordinate(value, label) {
  const result = Number(value);
  if (typeof value !== "number" || !Number.isFinite(result)) throw new TypeError(`${label} must be a finite number.`);
  return result;
}
function normalizeRichTextGlyph(value, label) {
  if (!isRecord$1(value) || typeof value.text !== "string") throw new TypeError(`SVG overlay ruby ${label} is invalid.`);
  return Object.freeze({
    baseline: requireFiniteCoordinate(value.baseline, `SVG overlay ruby ${label} baseline`),
    fontSize: requireFiniteDimension(value.fontSize, `SVG overlay ruby ${label} fontSize`),
    text: value.text,
    x: requireFiniteCoordinate(value.x, `SVG overlay ruby ${label} x`)
  });
}
function normalizeRichTextFragment(value) {
  if (!isRecord$1(value)) throw new TypeError("SVG overlay rich text fragment is invalid.");
  if (value.type === "text") {
    if (typeof value.text !== "string") throw new TypeError("SVG overlay rich text fragment text is invalid.");
    return Object.freeze({
      baseline: requireFiniteCoordinate(value.baseline, "SVG overlay rich text fragment baseline"),
      text: value.text,
      type: "text",
      x: requireFiniteCoordinate(value.x, "SVG overlay rich text fragment x")
    });
  }
  if (value.type === "ruby") return Object.freeze({
    base: normalizeRichTextGlyph(value.base, "base"),
    reading: normalizeRichTextGlyph(value.reading, "reading"),
    type: "ruby"
  });
  throw new TypeError("SVG overlay rich text fragment type must be text or ruby.");
}
function normalizeRichTextLayout(value) {
  if (!isRecord$1(value) || !Array.isArray(value.lines)) throw new TypeError("SVG overlay rich text layout is invalid.");
  const { lines: _plainLines, ...style } = normalizeTextLayout({
    ...value,
    lines: []
  });
  const lines = Object.freeze(value.lines.map((line) => {
    if (!isRecord$1(line) || !Array.isArray(line.fragments)) throw new TypeError("SVG overlay rich text line is invalid.");
    return Object.freeze({ fragments: Object.freeze(line.fragments.map((fragment) => normalizeRichTextFragment(fragment))) });
  }));
  return Object.freeze({
    ...style,
    lines
  });
}
function normalizeRenderedText(value) {
  return value.kind === "rich" ? Object.freeze({
    kind: "rich",
    layout: normalizeRichTextLayout(value.layout)
  }) : Object.freeze({
    kind: "plain",
    layout: normalizeTextLayout(value.layout)
  });
}
function createTextTarget(document, group) {
  let size = {
    width: 180,
    height: 48
  };
  let layoutProvider;
  let capturedLayoutProvider;
  let capturedSize;
  const createBackground = (layout) => {
    if (layout.backgroundColor === void 0 || layout.backgroundColor === "transparent") return;
    const background = document.createElementNS(svgNamespace, "rect");
    background.setAttribute("x", String(-layout.width / 2));
    background.setAttribute("y", String(-layout.height / 2));
    background.setAttribute("width", String(layout.width));
    background.setAttribute("height", String(layout.height));
    background.setAttribute("fill", layout.backgroundColor);
    if (layout.backgroundCornerRadius !== void 0) background.setAttribute("rx", String(layout.backgroundCornerRadius));
    return background;
  };
  const createTextElement = (layout, anchor) => {
    const text = document.createElementNS(svgNamespace, "text");
    text.setAttribute("text-anchor", anchor);
    text.setAttribute("fill", layout.fill);
    text.setAttribute("font-family", layout.fontFamily);
    text.setAttribute("font-size", String(layout.fontSize));
    if (layout.preserveWhitespace !== false) text.setAttributeNS(xmlNamespace, "xml:space", "preserve");
    if (layout.fontStyle !== void 0) text.setAttribute("font-style", layout.fontStyle);
    if (layout.fontWeight !== void 0) text.setAttribute("font-weight", String(layout.fontWeight));
    return text;
  };
  /**
  * Fragments carry absolute positions, so every tspan is start-anchored. A
  * ruby fragment draws its reading before its base; both always come from
  * the same fragment, so a reading never appears without its whole base.
  */
  const applyRichLayout = (layout) => {
    const children = [];
    const background = createBackground(layout);
    if (background !== void 0) children.push(background);
    const text = createTextElement(layout, "start");
    const appendTspan = (content, x, baseline, fontSize, rubyPart) => {
      const tspan = document.createElementNS(svgNamespace, "tspan");
      tspan.setAttribute("x", String(x));
      tspan.setAttribute("y", String(baseline));
      if (fontSize !== void 0) tspan.setAttribute("font-size", String(fontSize));
      if (rubyPart !== void 0) tspan.setAttribute("data-bubble-ruby", rubyPart);
      tspan.textContent = content;
      text.appendChild(tspan);
    };
    for (const line of layout.lines) for (const fragment of line.fragments) {
      if (fragment.type === "text") {
        appendTspan(fragment.text, fragment.x, fragment.baseline);
        continue;
      }
      const { base, reading } = fragment;
      appendTspan(reading.text, reading.x, reading.baseline, reading.fontSize, "reading");
      appendTspan(base.text, base.x, base.baseline, base.fontSize, "base");
    }
    children.push(text);
    group.replaceChildren(...children);
    size = {
      width: layout.width,
      height: layout.height
    };
  };
  const applyLayout = (layoutInput) => {
    const layout = normalizeTextLayout(layoutInput);
    const children = [];
    const background = createBackground(layout);
    if (background !== void 0) children.push(background);
    const anchor = layout.alignment === "left" ? "start" : layout.alignment === "right" ? "end" : "middle";
    const x = layout.alignment === "left" ? -layout.width / 2 : layout.alignment === "right" ? layout.width / 2 : 0;
    const text = createTextElement(layout, anchor);
    const firstBaseline = -Math.max(layout.fontSize, (layout.lines.length - 1) * layout.lineHeight + layout.fontSize) / 2 + layout.fontSize;
    layout.lines.forEach((line, index) => {
      const tspan = document.createElementNS(svgNamespace, "tspan");
      const positionedLine = typeof line === "string" ? void 0 : line;
      tspan.setAttribute("x", String(positionedLine?.x ?? x));
      tspan.setAttribute("y", String(positionedLine?.baseline ?? firstBaseline + index * layout.lineHeight));
      tspan.textContent = typeof line === "string" ? line : line.text;
      text.appendChild(tspan);
    });
    children.push(text);
    group.replaceChildren(...children);
    size = {
      width: layout.width,
      height: layout.height
    };
  };
  const applyRendered = (rendered) => {
    if (rendered.kind === "rich") {
      applyRichLayout(normalizeRichTextLayout(rendered.layout));
      return;
    }
    applyLayout(rendered.layout);
  };
  const plainProvider = (provider) => provider === void 0 ? void 0 : () => ({
    kind: "plain",
    layout: provider()
  });
  return Object.freeze({
    [overlayTextTargetMarker]: true,
    group,
    captureLayout() {
      capturedLayoutProvider = layoutProvider;
      capturedSize = { ...size };
    },
    clear() {
      group.replaceChildren();
      size = {
        width: 180,
        height: 48
      };
      layoutProvider = void 0;
      capturedLayoutProvider = void 0;
      capturedSize = void 0;
    },
    clearCapturedLayout() {
      capturedLayoutProvider = void 0;
      capturedSize = void 0;
    },
    getCapturedSize() {
      return capturedSize;
    },
    getSize() {
      return size;
    },
    refresh() {
      if (capturedLayoutProvider !== void 0) {
        const { layout: capturedLayout } = normalizeRenderedText(capturedLayoutProvider());
        capturedSize = {
          width: capturedLayout.width,
          height: capturedLayout.height
        };
      }
      if (layoutProvider !== void 0) applyRendered(layoutProvider());
    },
    render(layout, nextLayoutProvider) {
      layoutProvider = plainProvider(nextLayoutProvider);
      applyLayout(layout);
    },
    renderRich(layout, nextLayoutProvider) {
      layoutProvider = nextLayoutProvider === void 0 ? void 0 : () => ({
        kind: "rich",
        layout: nextLayoutProvider()
      });
      applyRichLayout(normalizeRichTextLayout(layout));
    }
  });
}
function requireTextTarget(value) {
  const candidate = value;
  if (candidate?.[overlayTextTargetMarker] !== true) throw new TypeError("SVG overlay text target is invalid.");
  return candidate;
}
function createSvgOverlayTextAdapter(capabilityInput, renderer) {
  if (!isRecord$1(capabilityInput) || typeof capabilityInput.layoutText !== "function") throw new TypeError("SVG overlay backend requires a text layout capability.");
  const capability = capabilityInput;
  const adapter = {
    setText({ styleName, target, text }) {
      const overlayTarget = requireTextTarget(target);
      const layoutProvider = () => capability.layoutText({
        nativeSize: readNativeSize(renderer),
        styleName,
        text
      });
      overlayTarget.render(layoutProvider(), layoutProvider);
    },
    releaseTarget(target) {
      requireTextTarget(target).clear();
    },
    measureText({ styleName, text }) {
      const nativeSize = readNativeSize(renderer);
      return requireFiniteDimension(capability.measureText?.({
        nativeSize,
        styleName,
        text
      }) ?? capability.layoutText({
        nativeSize,
        styleName,
        text
      }).width, "SVG overlay measured text width");
    },
    /**
    * Ruby needs a rich layout. A capability without one fails here rather
    * than drawing the base text and dropping the reading.
    */
    setRichText({ maxWidth, runs, styleName, target }) {
      const overlayTarget = requireTextTarget(target);
      const layoutRichText = requireOverlayRichLayout(capability);
      const layoutProvider = () => layoutRichText({
        nativeSize: readNativeSize(renderer),
        runs,
        styleName,
        ...maxWidth === void 0 ? {} : { maxWidth }
      });
      overlayTarget.renderRich(layoutProvider(), layoutProvider);
    }
  };
  if (typeof capability.layoutRichText === "function") adapter.measureRichText = ({ maxWidth, runs, styleName }) => requireFiniteDimension(requireOverlayRichLayout(capability)({
    nativeSize: readNativeSize(renderer),
    runs,
    styleName,
    ...maxWidth === void 0 ? {} : { maxWidth }
  }).width, "SVG overlay measured rich text width");
  return Object.freeze(adapter);
}
function requireOverlayRichLayout(capability) {
  const layoutRichText = capability.layoutRichText;
  if (typeof layoutRichText !== "function") throw new BubbleCompositionError("BUBBLE-COMPOSITION-007", "Bubble ruby content on the SVG overlay requires the overlay text capability layoutRichText method.");
  return (input) => layoutRichText.call(capability, input);
}
function isSafeImageSource(resource) {
  if (!(/* @__PURE__ */ new Set([
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/svg+xml",
    "image/webp"
  ])).has(resource.mimeType.toLowerCase())) return false;
  if (resource.mimeType.toLowerCase() === "image/svg+xml" && resource.svgSecurity !== "sanitized") return false;
  if (resource.src.startsWith("blob:")) return typeof resource.release === "function";
  return /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/iu.test(resource.src);
}
async function releaseImageResource(resource) {
  await resource?.release?.();
}
function createImageTarget(document, id, group) {
  const image = document.createElementNS(svgNamespace, "image");
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  group.appendChild(image);
  let resource;
  let displaySize = {
    width: 1,
    height: 1
  };
  let resourceGeneration = 0;
  const applyDisplaySize = () => {
    image.setAttribute("x", String(-displaySize.width / 2));
    image.setAttribute("y", String(-displaySize.height / 2));
    image.setAttribute("width", String(displaySize.width));
    image.setAttribute("height", String(displaySize.height));
  };
  applyDisplaySize();
  return Object.freeze({
    id,
    isStage: false,
    [overlayImageTargetMarker]: true,
    group,
    async applyResource(nextResource) {
      const generation = resourceGeneration + 1;
      resourceGeneration = generation;
      try {
        requireFiniteDimension(nextResource.width, "SVG overlay image width");
        requireFiniteDimension(nextResource.height, "SVG overlay image height");
        if (typeof nextResource.mimeType !== "string" || !nextResource.mimeType.startsWith("image/") || typeof nextResource.src !== "string" || !isSafeImageSource(nextResource)) throw new TypeError("SVG overlay image resources must use a supported MIME type, a releasable blob URL or approved raster data URL, and sanitized SVG metadata when applicable.");
      } catch (error) {
        await releaseImageResource(nextResource);
        throw error;
      }
      if (generation !== resourceGeneration) {
        await releaseImageResource(nextResource);
        return;
      }
      const previous = resource;
      resource = nextResource;
      image.setAttribute("href", nextResource.src);
      await releaseImageResource(previous);
    },
    getSize() {
      return resource ? {
        width: resource.width,
        height: resource.height
      } : {
        width: 1,
        height: 1
      };
    },
    async release() {
      resourceGeneration += 1;
      const previous = resource;
      resource = void 0;
      image.removeAttribute("href");
      await releaseImageResource(previous);
    },
    setDisplaySize(nextSize) {
      displaySize = nextSize;
      applyDisplaySize();
    },
    setVisible(visible) {
      group.setAttribute("visibility", visible ? "visible" : "hidden");
    }
  });
}
function requireImageTarget(value) {
  const candidate = value;
  if (candidate?.[overlayImageTargetMarker] !== true) throw new TypeError("SVG overlay image target is invalid.");
  return candidate;
}
function createSvgOverlayImageAdapter(capabilityInput) {
  if (!isRecord$1(capabilityInput) || typeof capabilityInput.isRegistered !== "function" || typeof capabilityInput.getMimeType !== "function" || typeof capabilityInput.resolveImage !== "function") throw new TypeError("SVG overlay image capability is invalid.");
  const capability = capabilityInput;
  return Object.freeze({
    isRegistered(name) {
      return capability.isRegistered(name);
    },
    getMimeType(name) {
      return capability.getMimeType(name);
    },
    async applyToTarget(name, target) {
      await requireImageTarget(target).applyResource(await capability.resolveImage(name));
    }
  });
}
function createSvgOverlaySurfaceManager(renderer, documentInput) {
  const root = documentInput.createElementNS(svgNamespace, "svg");
  root.setAttribute("xmlns", svgNamespace);
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("focusable", "false");
  root.setAttribute("data-bubble-render-backend", "svg-overlay");
  root.style.display = "block";
  root.style.overflow = "hidden";
  root.style.pointerEvents = "none";
  const groups = /* @__PURE__ */ new Set();
  let attached = false;
  const updateNativeSize = () => {
    const size = readNativeSize(renderer);
    root.setAttribute("width", String(size.width));
    root.setAttribute("height", String(size.height));
    root.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
    return size;
  };
  return Object.freeze({
    document: documentInput,
    renderer,
    acquire(group) {
      if (groups.has(group)) return;
      updateNativeSize();
      if (!attached) try {
        renderer.addOverlay(root, "scale");
        attached = true;
      } catch (error) {
        renderer.removeOverlay(root);
        throw error;
      }
      root.appendChild(group);
      groups.add(group);
    },
    release(group) {
      if (!groups.delete(group)) return;
      group.remove();
      if (groups.size === 0 && attached) {
        renderer.removeOverlay(root);
        attached = false;
      }
    },
    updateNativeSize
  });
}
function targetBounds$1(target) {
  try {
    const bounds = target.getBoundsForBubble?.();
    if (bounds && [
      bounds.bottom,
      bounds.left,
      bounds.right,
      bounds.top
    ].every((value) => Number.isFinite(value))) return bounds;
  } catch {}
  const x = Number.isFinite(target.x) ? Number(target.x) : 0;
  const y = Number.isFinite(target.y) ? Number(target.y) : 0;
  return {
    bottom: y,
    left: x,
    right: x,
    top: y
  };
}
function clamp$1(value, minimum, maximum) {
  if (maximum < minimum) return (minimum + maximum) / 2;
  return Math.min(maximum, Math.max(minimum, value));
}
function tailDirectionForPlacement$1(direction) {
  const vector = bubbleDirectionVector(direction);
  return (Math.atan2(-vector.x, -vector.y) * 180 / Math.PI % 360 + 360) % 360;
}
var allowedBodyElements = /* @__PURE__ */ new Set([
  "circle",
  "g",
  "path",
  "rect",
  "text",
  "title"
]);
var allowedBodyAttributes = /* @__PURE__ */ new Set([
  "cx",
  "cy",
  "d",
  "data-boolean-operation",
  "data-tail-base-on-border",
  "fill",
  "fill-rule",
  "font-family",
  "font-size",
  "height",
  "opacity",
  "paint-order",
  "r",
  "rx",
  "stroke",
  "stroke-dasharray",
  "stroke-linejoin",
  "stroke-width",
  "transform",
  "width",
  "xml:space",
  "x",
  "y"
]);
function copyAllowedBodyNode(source, document) {
  const name = source.localName;
  if (!allowedBodyElements.has(name)) throw new TypeError(`Bubble body SVG element is not allowed: ${name}`);
  const result = document.createElementNS(svgNamespace, name);
  for (const attribute of source.getAttributeNames()) {
    if (!allowedBodyAttributes.has(attribute)) throw new TypeError(`Bubble body SVG attribute is not allowed: ${attribute}`);
    const value = source.getAttribute(attribute) ?? "";
    if (/javascript:|url\s*\(/iu.test(value)) throw new TypeError("Bubble body SVG contains an unsafe attribute value.");
    result.setAttribute(attribute, value);
  }
  if (name === "title" || name === "text") result.textContent = source.textContent ?? "";
  for (const child of Array.from(source.children)) result.appendChild(copyAllowedBodyNode(child, document));
  return result;
}
function replaceBodyFromCanonicalSvg(group, svg, document) {
  const Parser = document.defaultView?.DOMParser;
  if (!Parser) throw new TypeError("SVG overlay backend requires DOMParser.");
  const parsed = new Parser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new TypeError("Canonical Bubble body SVG could not be parsed.");
  const children = Array.from(parsed.documentElement.children).map((child) => copyAllowedBodyNode(child, document));
  group.replaceChildren(...children);
}
function fitImage(target, boxSize, scaleMultiplier = 1) {
  const native = target.getSize();
  const scale = Math.min(boxSize / native.width, boxSize / native.height);
  const size = {
    width: native.width * scale * scaleMultiplier,
    height: native.height * scale * scaleMultiplier
  };
  target.setDisplaySize(size);
  return size;
}
function createSvgOverlaySurface(manager, actor, actorKey, kind, style, scheduler) {
  const { document, renderer } = manager;
  const sequence = overlaySurfaceSequence;
  overlaySurfaceSequence += 1;
  const surfaceGroup = document.createElementNS(svgNamespace, "g");
  surfaceGroup.setAttribute("data-bubble-surface", `${actorKey}:${sequence}`);
  const bodyGroup = document.createElementNS(svgNamespace, "g");
  bodyGroup.setAttribute("data-bubble-layer", "body");
  surfaceGroup.appendChild(bodyGroup);
  const createLayerGroup = (layer) => {
    const group = document.createElementNS(svgNamespace, "g");
    group.setAttribute("data-bubble-layer", layer);
    group.setAttribute("visibility", "hidden");
    surfaceGroup.appendChild(group);
    return group;
  };
  const portraitBase = createImageTarget(document, `bubble:${actorKey}:${sequence}:portrait-base`, createLayerGroup("portrait-base"));
  const portraitBlink = createImageTarget(document, `bubble:${actorKey}:${sequence}:portrait-blink`, createLayerGroup("portrait-blink"));
  const portraitLipSync = createImageTarget(document, `bubble:${actorKey}:${sequence}:portrait-lip-sync`, createLayerGroup("portrait-lip-sync"));
  const textGroup = createLayerGroup("text");
  const text = createTextTarget(document, textGroup);
  const continueIndicator = createImageTarget(document, `bubble:${actorKey}:${sequence}:continue-indicator`, createLayerGroup("continue-indicator"));
  const targets = Object.freeze({
    text,
    portraitBase,
    portraitBlink,
    portraitLipSync,
    continueIndicator
  });
  const layerTargets = /* @__PURE__ */ new Map([
    ["portraitBase", portraitBase],
    ["portraitBlink", portraitBlink],
    ["portraitLipSync", portraitLipSync],
    ["continueIndicator", continueIndicator]
  ]);
  const layerVisibility = /* @__PURE__ */ new Map();
  const clipId = `bubble-portrait-clip-${sequence}`;
  const definitions = document.createElementNS(svgNamespace, "defs");
  const clipPath = document.createElementNS(svgNamespace, "clipPath");
  const clipRect = document.createElementNS(svgNamespace, "rect");
  clipPath.setAttribute("id", clipId);
  clipPath.appendChild(clipRect);
  definitions.appendChild(clipPath);
  surfaceGroup.insertBefore(definitions, bodyGroup);
  let currentStyle = style;
  let disposed = false;
  let surfaceVisible = false;
  let bodySignature = "";
  let motionTranslation = [0, 0];
  let motionScaleMultiplier = 1;
  let motionOpacity = 1;
  let center = [0, 0];
  let shapeTransition;
  let scratchTextLayout;
  let scratchPointsLeft = false;
  const applyMotionTransform = (native = manager.updateNativeSize()) => {
    const centerX = native.width / 2 + center[0];
    const centerY = native.height / 2 - center[1];
    const translatedX = centerX + motionTranslation[0];
    const translatedY = centerY - motionTranslation[1];
    surfaceGroup.setAttribute("transform", `translate(${translatedX} ${translatedY}) scale(${motionScaleMultiplier}) translate(${-centerX} ${-centerY})`);
    surfaceGroup.setAttribute("opacity", String(motionOpacity));
  };
  const layerAllowedByStyle = (layer) => {
    if (layer === "continueIndicator") return currentStyle.continueIndicator !== void 0;
    if (layer === "portraitBase") return currentStyle.portrait !== void 0;
    if (layer === "portraitBlink") return currentStyle.portrait?.blink !== void 0;
    return currentStyle.portrait?.lipSync !== void 0;
  };
  const updateVisibility = (nativeSize) => {
    const actorVisible = currentStyle.placement.basis === "background" || actor.visible !== false;
    const visible = surfaceVisible && actorVisible && motionOpacity > 0;
    const scratchDefaultRendered = currentStyle.layoutProfile === "scratch-default" && scratchTextLayout !== void 0;
    surfaceGroup.setAttribute("visibility", visible ? "visible" : "hidden");
    bodyGroup.setAttribute("visibility", visible && (scratchDefaultRendered || currentStyle.visualStyle !== "NO_BUBBLE") ? "visible" : "hidden");
    textGroup.setAttribute("visibility", visible && !scratchDefaultRendered ? "visible" : "hidden");
    for (const [layer, target] of layerTargets) target.setVisible(visible && layerAllowedByStyle(layer) && (layerVisibility.get(layer) ?? false));
    applyMotionTransform(nativeSize);
  };
  const position = () => {
    if (disposed) return;
    const native = manager.updateNativeSize();
    if (currentStyle.layoutProfile === "scratch-default" && scratchTextLayout !== void 0) {
      const metrics = scratchBubbleMetrics(scratchTextLayout);
      const nextPosition = positionScratchBubble({
        bounds: targetBounds$1(actor),
        height: metrics.height,
        pointsLeft: scratchPointsLeft,
        stageHeight: native.height,
        stageWidth: native.width,
        width: metrics.width
      });
      scratchPointsLeft = nextPosition.pointsLeft;
      center = [nextPosition.centerX, nextPosition.centerY];
      const nextBodySignature = JSON.stringify({
        kind,
        layout: scratchTextLayout,
        pointsLeft: scratchPointsLeft
      });
      if (nextBodySignature !== bodySignature) {
        replaceBodyFromCanonicalSvg(bodyGroup, renderScratchBubbleSvg({
          kind,
          layout: scratchTextLayout,
          pointsLeft: scratchPointsLeft,
          title: `${currentStyle.name} ${kind} Bubble`
        }), document);
        bodySignature = nextBodySignature;
      }
      bodyGroup.setAttribute("data-bubble-style", "SCRATCH_DEFAULT");
      bodyGroup.setAttribute("data-bubble-profile", "scratch-default");
      bodyGroup.setAttribute("data-bubble-kind", kind);
      bodyGroup.setAttribute("data-bubble-body-width", String(metrics.width));
      bodyGroup.setAttribute("data-bubble-body-height", String(metrics.height));
      bodyGroup.setAttribute("transform", `translate(${native.width / 2 + nextPosition.left} ${native.height / 2 - nextPosition.top})`);
      updateVisibility(native);
      return;
    }
    bodyGroup.removeAttribute("data-bubble-profile");
    bodyGroup.removeAttribute("data-bubble-kind");
    const scaleMultiplier = currentStyle.placement.basis === "actor" ? currentStyle.offset.scalePercent / 100 : 1;
    const nativeTextSize = text.getCapturedSize() ?? text.getSize();
    const textSize = {
      width: nativeTextSize.width * scaleMultiplier,
      height: nativeTextSize.height * scaleMultiplier
    };
    const portraitZoomMultiplier = (currentStyle.portrait?.offset.zoomPercent ?? 100) / 100;
    const hasPortrait = currentStyle.portrait !== void 0;
    const portraitSize = hasPortrait ? fitImage(portraitBase, portraitBoxSize$1 * portraitZoomMultiplier, scaleMultiplier) : {
      width: 0,
      height: 0
    };
    for (const target of [portraitBlink, portraitLipSync]) if (hasPortrait) fitImage(target, portraitBoxSize$1 * portraitZoomMultiplier, scaleMultiplier);
    const indicatorSize = fitImage(continueIndicator, indicatorBoxSize$1, scaleMultiplier);
    const totalWidth = portraitSize.width + (hasPortrait ? contentGap$1 * scaleMultiplier : 0) + textSize.width;
    const contentHeight = Math.max(portraitSize.height, textSize.height);
    const { width: baseBubbleWidth, height: baseBubbleHeight } = bubbleBodySizeForContent({
      contentWidth: totalWidth / scaleMultiplier,
      contentHeight: contentHeight / scaleMultiplier,
      styles: [currentStyle.visualStyle, ...shapeTransition === void 0 ? [] : [shapeTransition.from, shapeTransition.to]]
    });
    const bubbleWidth = Math.max(totalWidth, (baseBubbleWidth - 48) * scaleMultiplier);
    const bubbleHeight = Math.max(contentHeight, (baseBubbleHeight - 48) * scaleMultiplier);
    const stageLeft = -native.width / 2;
    const stageRight = native.width / 2;
    const stageTop = native.height / 2;
    const stageBottom = -native.height / 2;
    let centerX;
    let centerY;
    if (currentStyle.placement.basis === "background") {
      centerX = 0;
      if (currentStyle.placement.region === "HEADER_LIKE") centerY = stageTop - stageSafeMargin$1 - bubbleHeight / 2;
      else if (currentStyle.placement.region === "FOOTER_LIKE") centerY = stageBottom + stageSafeMargin$1 + bubbleHeight / 2;
      else centerY = 0;
    } else {
      const nextCenter = actorRelativeBubbleCenter({
        bounds: targetBounds$1(actor),
        bubbleWidth,
        bubbleHeight,
        direction: currentStyle.placement.direction,
        distance: currentStyle.distance,
        tailLength: currentStyle.tailLength,
        offset: currentStyle.offset
      });
      centerX = nextCenter.x;
      centerY = nextCenter.y;
    }
    centerX = clamp$1(centerX, stageLeft + bubbleWidth / 2, stageRight - bubbleWidth / 2);
    centerY = clamp$1(centerY, stageBottom + bubbleHeight / 2, stageTop - bubbleHeight / 2);
    center = [centerX, centerY];
    const tailDirection = currentStyle.placement.basis === "actor" ? tailDirectionForPlacement$1(currentStyle.placement.direction) : null;
    const bodyOffset = currentStyle.placement.basis === "actor" ? [
      currentStyle.offset.x,
      currentStyle.offset.y,
      currentStyle.offset.scalePercent
    ] : [
      0,
      0,
      100
    ];
    const bodyCenterOffset = tailDirection === null ? {
      x: 0,
      y: 0
    } : bubbleBodyCenterOffset({
      style: currentStyle.visualStyle,
      width: baseBubbleWidth,
      height: baseBubbleHeight,
      tailDirection,
      tailLength: currentStyle.tailLength,
      offset: bodyOffset
    });
    const nextBodySignature = JSON.stringify({
      baseBubbleHeight,
      baseBubbleWidth,
      bodyOffset,
      shapeTransition,
      tailDirection,
      tailLength: currentStyle.tailLength,
      visualStyle: currentStyle.visualStyle
    });
    if (nextBodySignature !== bodySignature) {
      replaceBodyFromCanonicalSvg(bodyGroup, renderBubbleSvg({
        style: currentStyle.visualStyle,
        lines: [],
        width: baseBubbleWidth,
        height: baseBubbleHeight,
        tailDirection,
        tailLength: currentStyle.tailLength,
        offset: bodyOffset,
        title: `${currentStyle.name} Bubble body`,
        ...shapeTransition === void 0 ? {} : { shapeTransition }
      }), document);
      bodySignature = nextBodySignature;
    }
    bodyGroup.setAttribute("data-bubble-style", currentStyle.visualStyle);
    bodyGroup.setAttribute("data-bubble-body-width", String(baseBubbleWidth));
    bodyGroup.setAttribute("data-bubble-body-height", String(baseBubbleHeight));
    if (shapeTransition === void 0) {
      bodyGroup.removeAttribute("data-bubble-shape-transition-from");
      bodyGroup.removeAttribute("data-bubble-shape-transition-to");
      bodyGroup.removeAttribute("data-bubble-shape-transition-progress");
    } else {
      bodyGroup.setAttribute("data-bubble-shape-transition-from", shapeTransition.from);
      bodyGroup.setAttribute("data-bubble-shape-transition-to", shapeTransition.to);
      bodyGroup.setAttribute("data-bubble-shape-transition-progress", String(shapeTransition.progress));
    }
    const bodyDrawableX = centerX - bodyCenterOffset.x;
    const bodyDrawableY = centerY + bodyCenterOffset.y;
    bodyGroup.setAttribute("transform", `translate(${native.width / 2 + bodyDrawableX - baseBubbleWidth / 2} ${native.height / 2 - bodyDrawableY - baseBubbleHeight / 2})`);
    const left = centerX - totalWidth / 2;
    const portraitPlacement = currentStyle.portrait?.placement ?? "left";
    const portraitOnRight = portraitPlacement.endsWith("right");
    const portraitOffsetX = (currentStyle.portrait?.offset.x ?? 0) * scaleMultiplier;
    const portraitOffsetY = (currentStyle.portrait?.offset.y ?? 0) * scaleMultiplier;
    const portraitX = (portraitOnRight ? left + textSize.width + contentGap$1 * scaleMultiplier : left) + portraitSize.width / 2 + portraitOffsetX;
    let portraitY = centerY;
    if (portraitPlacement.startsWith("top-")) portraitY = centerY + contentHeight / 2 - portraitSize.height / 2;
    else if (portraitPlacement.startsWith("bottom-")) portraitY = centerY - contentHeight / 2 + portraitSize.height / 2;
    portraitY += portraitOffsetY;
    const textX = (portraitOnRight || !hasPortrait ? left : left + portraitSize.width + contentGap$1 * scaleMultiplier) + textSize.width / 2;
    const toDomTransform = (x, y) => `translate(${native.width / 2 + x} ${native.height / 2 - y})`;
    for (const target of [
      portraitBase,
      portraitBlink,
      portraitLipSync
    ]) target.group.setAttribute("transform", toDomTransform(portraitX, portraitY));
    textGroup.setAttribute("transform", `${toDomTransform(textX, centerY)} scale(${scaleMultiplier})`);
    const indicatorX = textX + textSize.width / 2 - indicatorSize.width / 2 - contentGap$1 * scaleMultiplier;
    const indicatorY = centerY - textSize.height / 2 + indicatorSize.height / 2 + contentGap$1 * scaleMultiplier;
    continueIndicator.group.setAttribute("transform", toDomTransform(indicatorX, indicatorY));
    const radius = Math.min(currentStyle.portrait?.cornerRadius ?? 0, portraitSize.width / 2, portraitSize.height / 2);
    clipRect.setAttribute("x", String(-portraitSize.width / 2));
    clipRect.setAttribute("y", String(-portraitSize.height / 2));
    clipRect.setAttribute("width", String(portraitSize.width));
    clipRect.setAttribute("height", String(portraitSize.height));
    clipRect.setAttribute("rx", String(radius));
    for (const target of [
      portraitBase,
      portraitBlink,
      portraitLipSync
    ]) if (radius > 0) target.group.setAttribute("clip-path", `url(#${clipId})`);
    else target.group.removeAttribute("clip-path");
    updateVisibility(native);
  };
  const originalVisualChange = actor.onTargetVisualChange;
  const visualChangeHook = (changedTarget) => {
    originalVisualChange?.(changedTarget);
    position();
  };
  const nativeSizeHook = () => {
    text.refresh();
    position();
  };
  manager.acquire(surfaceGroup);
  if (currentStyle.placement.basis === "actor") actor.onTargetVisualChange = visualChangeHook;
  renderer.on?.("NativeSizeChanged", nativeSizeHook);
  return Object.freeze({
    targets,
    setLayerVisible(layer, visible) {
      if (disposed) return;
      layerVisibility.set(layer, visible);
      updateVisibility();
    },
    async updateStyle(nextStyle) {
      if (disposed) return;
      const removedTargets = [...nextStyle.portrait === void 0 ? [
        portraitBase,
        portraitBlink,
        portraitLipSync
      ] : [...nextStyle.portrait.blink === void 0 ? [portraitBlink] : [], ...nextStyle.portrait.lipSync === void 0 ? [portraitLipSync] : []], ...nextStyle.continueIndicator === void 0 ? [continueIndicator] : []];
      await Promise.all(removedTargets.map((target) => target.release()));
      const wasActorRelative = currentStyle.placement.basis === "actor";
      currentStyle = nextStyle;
      motionTranslation = [0, 0];
      motionScaleMultiplier = 1;
      motionOpacity = 1;
      shapeTransition = void 0;
      bodySignature = "";
      if (nextStyle.reveal?.layout !== "RESERVED") text.clearCapturedLayout();
      const isActorRelative = currentStyle.placement.basis === "actor";
      if (wasActorRelative && !isActorRelative) {
        if (actor.onTargetVisualChange === visualChangeHook) actor.onTargetVisualChange = originalVisualChange ?? null;
      } else if (!wasActorRelative && isActorRelative) actor.onTargetVisualChange = visualChangeHook;
      position();
    },
    captureTextLayout() {
      if (disposed) return;
      text.captureLayout();
      position();
    },
    clearTextLayout() {
      text.clearCapturedLayout();
      position();
    },
    renderScratchText(layout) {
      if (disposed) return;
      scratchTextLayout = layout;
      bodySignature = "";
      position();
    },
    async animate(motion) {
      if (disposed) return;
      const durationSeconds = Math.max(0, motion.durationSeconds ?? 0);
      const setFrame = () => {
        if (disposed) return;
        updateVisibility();
      };
      const eased = (progress) => easeMotionProgress(progress, motion.ease ?? "easeInOut");
      if (motion.name === "fadeIn" || motion.name === "floatIn" || motion.name === "zoomIn" || motion.name === "riseUp") {
        surfaceVisible = true;
        const startingTranslation = motion.name === "floatIn" || motion.name === "riseUp" ? [0, 16] : [0, 0];
        const startingScale = motion.name === "zoomIn" ? .01 : 1;
        motionTranslation = startingTranslation;
        motionScaleMultiplier = startingScale;
        motionOpacity = motion.name === "fadeIn" ? 0 : 1;
        setFrame();
        await runMotionTimeline(scheduler, durationSeconds, (progress) => {
          const easedProgress = eased(progress);
          motionTranslation = [startingTranslation[0] * (1 - easedProgress), startingTranslation[1] * (1 - easedProgress)];
          motionScaleMultiplier = startingScale + (1 - startingScale) * easedProgress;
          motionOpacity = motion.name === "fadeIn" ? easedProgress : 1;
          setFrame();
        });
        motionTranslation = [0, 0];
        motionScaleMultiplier = 1;
        motionOpacity = 1;
        position();
        return;
      }
      if (motion.name === "fadeOut" || motion.name === "floatOut" || motion.name === "zoomOut" || motion.name === "sink") {
        const endingTranslation = motion.name === "floatOut" || motion.name === "sink" ? [0, -16] : [0, 0];
        const endingScale = motion.name === "zoomOut" ? .01 : 1;
        await runMotionTimeline(scheduler, durationSeconds, (progress) => {
          const easedProgress = eased(progress);
          motionTranslation = [endingTranslation[0] * easedProgress, endingTranslation[1] * easedProgress];
          motionScaleMultiplier = 1 + (endingScale - 1) * easedProgress;
          motionOpacity = motion.name === "fadeOut" ? 1 - easedProgress : 1;
          setFrame();
        });
        surfaceVisible = false;
        updateVisibility();
        motionTranslation = [0, 0];
        motionScaleMultiplier = 1;
        motionOpacity = 1;
        return;
      }
      if (motion.name === "shake") {
        const count = Math.max(1, Math.floor(motion.count ?? 1));
        const animationDuration = durationSeconds > 0 ? durationSeconds : count * .08;
        const vector = bubbleDirectionVector(typeof motion.direction === "number" ? motion.direction : motion.direction ?? "right");
        await runMotionTimeline(scheduler, animationDuration, (progress) => {
          const displacement = Math.sin(eased(progress) * count * Math.PI * 2) * 5;
          motionTranslation = [vector.x * displacement, vector.y * displacement];
          setFrame();
        });
        motionTranslation = [0, 0];
        position();
        return;
      }
      if (motion.name === "explode") {
        const count = Math.max(1, Math.floor(motion.count ?? 1));
        const animationDuration = durationSeconds > 0 ? durationSeconds : count * .12;
        const factor = motion.relativeScale ?? 1.15;
        await runMotionTimeline(scheduler, animationDuration, (progress) => {
          const wave = Math.abs(Math.sin(eased(progress) * count * Math.PI));
          motionScaleMultiplier = 1 + (factor - 1) * wave;
          setFrame();
        });
        motionScaleMultiplier = 1;
        position();
        return;
      }
      if (motion.name === "animateBubbleShape") {
        const targetStyle = motion.visualStyle ?? currentStyle.visualStyle;
        const fromStyle = currentStyle.visualStyle;
        const speed = motion.speed === void 0 ? 1 : Math.max(0, motion.speed);
        shapeTransition = {
          from: fromStyle,
          to: targetStyle,
          progress: 0
        };
        position();
        await runMotionTimeline(scheduler, durationSeconds, (progress) => {
          const speedProgress = durationSeconds === 0 ? 1 : clampMotionProgress(progress * Math.max(speed, 1));
          shapeTransition = {
            from: fromStyle,
            to: targetStyle,
            progress: easeMotionProgress(speedProgress, motion.ease ?? "easeInOut")
          };
          bodySignature = "";
          position();
        });
        shapeTransition = void 0;
        bodySignature = "";
        position();
      }
    },
    show() {
      if (disposed) return;
      surfaceVisible = true;
      position();
    },
    hide() {
      if (disposed) return;
      surfaceVisible = false;
      updateVisibility();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const cleanupErrors = [];
      const runCleanup = (operation) => {
        try {
          operation();
        } catch (error) {
          cleanupErrors.push(error);
        }
      };
      runCleanup(() => {
        if (actor.onTargetVisualChange === visualChangeHook) actor.onTargetVisualChange = originalVisualChange ?? null;
      });
      runCleanup(() => renderer.off?.("NativeSizeChanged", nativeSizeHook));
      runCleanup(() => manager.release(surfaceGroup));
      runCleanup(() => text.clear());
      const releaseResults = await Promise.allSettled([...layerTargets.values()].map((target) => target.release()));
      cleanupErrors.push(...releaseResults.flatMap((result) => result.status === "rejected" ? [result.reason] : []));
      if (cleanupErrors.length === 1) throw cleanupErrors[0];
      if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "Failed to dispose SVG overlay Bubble surface.");
    }
  });
}
//#endregion
//#region src/turbowarp-adapter.ts
var spriteLayer = "sprite";
var portraitBoxSize = 96;
var indicatorBoxSize = 18;
var contentGap = 8;
var stageSafeMargin = 16;
var surfaceSequence = 0;
var BubbleRuntimeAdapterError = class extends Error {
  constructor(code, message) {
    super(message);
    _defineProperty(this, "code", void 0);
    this.name = "BubbleRuntimeAdapterError";
    this.code = code;
  }
};
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireRenderer(value) {
  if (!isRecord(value)) throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-001", "Bubble requires the TurboWarp renderer.");
  const methods = [
    "createSVGSkin",
    "createDrawable",
    "destroyDrawable",
    "destroySkin",
    "getCurrentSkinSize",
    "getNativeSize",
    "updateDrawablePosition",
    "updateDrawableScale",
    "updateDrawableSkinId",
    "updateDrawableVisible"
  ];
  if (methods.some((method) => typeof value[method] !== "function")) throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-001", `Bubble renderer must provide ${methods.join(", ")}.`);
  return value;
}
function normalizeRenderBackend(value) {
  const backend = value ?? "svg-overlay";
  if (backend !== "scratch-render" && backend !== "svg-overlay") throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-004", "Bubble bubbleRenderBackend must be scratch-render or svg-overlay.");
  return backend;
}
function normalizeOverlayUnsupportedBehavior(value) {
  const behavior = value ?? "error";
  if (behavior !== "error" && behavior !== "fallback") throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-004", "Bubble svgOverlayUnsupportedBehavior must be error or fallback.");
  return behavior;
}
function resolveOverlayDocument(value) {
  const documentValue = value ?? (typeof globalThis.document === "undefined" ? void 0 : globalThis.document);
  if (documentValue === void 0) return void 0;
  if (!isRecord(documentValue) || typeof documentValue.createElementNS !== "function") throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-004", "Bubble SVG overlay document must provide createElementNS().");
  return documentValue;
}
function overlayUnavailableReason(renderer, documentValue, textCapability) {
  if (typeof renderer.addOverlay !== "function" || typeof renderer.removeOverlay !== "function") return "the renderer does not provide addOverlay() and removeOverlay()";
  if (documentValue === void 0) return "the host does not provide a DOM document";
  if (typeof documentValue.defaultView?.DOMParser !== "function") return "the host document does not provide DOMParser";
  if (!isRecord(textCapability) || typeof textCapability.layoutText !== "function") return "a host-neutral svgOverlayTextCapability is not available";
}
function createDefaultSvgOverlayTextCapability() {
  const composition = createSvgTextLayoutComposition();
  const definedStyles = /* @__PURE__ */ new Set();
  const defineStyle = (name) => {
    composition.defineStyle({
      name,
      backgroundColor: "transparent"
    });
    definedStyles.add(name);
  };
  defineStyle("default");
  return createSvgTextOverlayTextCapability(Object.freeze({
    layoutText(input) {
      if (!definedStyles.has(input.styleName)) defineStyle(input.styleName);
      return composition.layoutText(input);
    },
    layoutRichText(input) {
      if (!definedStyles.has(input.styleName)) defineStyle(input.styleName);
      return composition.layoutRichText(input);
    }
  }));
}
function createDefaultScratchRenderTextCapability(runtime) {
  const composition = createSvgTextComposition({ runtime });
  const definedStyles = /* @__PURE__ */ new Set();
  const defineStyle = (name) => {
    composition.defineStyle({
      name,
      backgroundColor: "transparent"
    });
    definedStyles.add(name);
  };
  const ensureStyle = (name) => {
    if (!definedStyles.has(name)) defineStyle(name);
  };
  defineStyle("default");
  return createSvgTextCompositionCapability(Object.freeze({
    setText(input) {
      ensureStyle(input.styleName);
      composition.setText(input);
    },
    releaseTarget(target) {
      composition.releaseTarget(target);
    },
    measureText(input) {
      ensureStyle(input.styleName);
      return composition.measureText(input);
    }
  }));
}
function requireAssetManager(value) {
  if (!isRecord(value) || typeof value.isLoaded !== "function" || typeof value.getAssetMimeType !== "function" || typeof value.resolveSkin !== "function") throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-002", "Bubble image assets require an imageResolver capability. Load @kubohiroya/turbowarp-asset-cache or provide options.imageResolver before using image features.");
  return value;
}
function requireAssetManagerDOMImageCapability(value) {
  if (!isRecord(value) || typeof value.getDOMImageCapability !== "function") throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-002", "Bubble SVG overlay image assets require @kubohiroya/turbowarp-asset-cache 0.1.0 or a host-provided options.svgOverlayImageCapability.");
  const capability = value.getDOMImageCapability();
  if (!isRecord(capability) || typeof capability.isRegistered !== "function" || typeof capability.getMimeType !== "function" || typeof capability.resolveDOMImageResource !== "function") throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-002", "Asset Manager did not provide a valid DOM image capability.");
  return capability;
}
function targetBounds(target) {
  try {
    const bounds = target.getBoundsForBubble?.();
    if (bounds && [
      bounds.bottom,
      bounds.left,
      bounds.right,
      bounds.top
    ].every((value) => Number.isFinite(value))) return bounds;
  } catch {}
  const x = Number.isFinite(target.x) ? Number(target.x) : 0;
  const y = Number.isFinite(target.y) ? Number(target.y) : 0;
  return {
    bottom: y,
    left: x,
    right: x,
    top: y
  };
}
function readSize(renderer, target, fallback) {
  const raw = renderer.getCurrentSkinSize(target.drawableID);
  if (!Array.isArray(raw) || raw.length < 2) return fallback;
  const width = Number(raw[0]);
  const height = Number(raw[1]);
  if (!(width > 0) || !(height > 0)) return fallback;
  return {
    width,
    height
  };
}
function fitDrawable(renderer, target, boxSize, scaleMultiplier = 1) {
  const native = readSize(renderer, target, {
    width: boxSize,
    height: boxSize
  });
  const effectiveScale = Math.min(boxSize / native.width, boxSize / native.height) * scaleMultiplier;
  renderer.updateDrawableScale(target.drawableID, [effectiveScale * 100, effectiveScale * 100]);
  return {
    width: native.width * effectiveScale,
    height: native.height * effectiveScale,
    scalePercent: effectiveScale * 100
  };
}
function renderPortraitCornerMaskSvg(width, height, radius) {
  const roundedRadius = Math.min(radius, width / 2, height / 2);
  const right = width - roundedRadius;
  const bottom = height - roundedRadius;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <path d="M0 0H${width}V${height}H0Z M${roundedRadius} 0H${right}A${roundedRadius} ${roundedRadius} 0 0 1 ${width} ${roundedRadius}V${bottom}A${roundedRadius} ${roundedRadius} 0 0 1 ${right} ${height}H${roundedRadius}A${roundedRadius} ${roundedRadius} 0 0 1 0 ${bottom}V${roundedRadius}A${roundedRadius} ${roundedRadius} 0 0 1 ${roundedRadius} 0Z" fill="#fff4cc" fill-rule="evenodd" data-bubble-portrait-corner-radius="${roundedRadius}"/>
</svg>`;
}
function clamp(value, minimum, maximum) {
  if (maximum < minimum) return (minimum + maximum) / 2;
  return Math.min(maximum, Math.max(minimum, value));
}
function expandSvgViewport(svg, width, height, extraX, extraY) {
  const expandedWidth = width + extraX * 2;
  const expandedHeight = height + extraY * 2;
  return svg.replace(/<svg\b[^>]*>/u, (root) => root.replace(/\bwidth="[^"]*"/u, `width="${expandedWidth}"`).replace(/\bheight="[^"]*"/u, `height="${expandedHeight}"`).replace(/\bviewBox="[^"]*"/u, `viewBox="${-extraX} ${-extraY} ${expandedWidth} ${expandedHeight}"`));
}
function tailDirectionForPlacement(direction) {
  const vector = bubbleDirectionVector(direction);
  return (Math.atan2(-vector.x, -vector.y) * 180 / Math.PI % 360 + 360) % 360;
}
function createSurface(runtime, actor, actorKey, kind, style, scheduler) {
  const renderer = runtime.renderer;
  const sequence = surfaceSequence;
  surfaceSequence += 1;
  const drawables = [];
  let bodySkinId;
  let portraitMaskSkinId;
  const createTarget = (layer) => {
    const drawableID = renderer.createDrawable(spriteLayer);
    if (!Number.isInteger(drawableID) || drawableID < 0) throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-001", `TurboWarp did not create the Bubble ${layer} drawable.`);
    const target = Object.freeze({
      id: `bubble:${actorKey}:${sequence}:${layer}`,
      isStage: false,
      drawableID
    });
    drawables.push(target);
    renderer.updateDrawableVisible(drawableID, false);
    renderer.setDrawableOrder?.(drawableID, Infinity, spriteLayer);
    return target;
  };
  try {
    const body = createTarget("body");
    const portraitBase = style.portrait ? createTarget("portrait-base") : void 0;
    const portraitBlink = style.portrait?.blink ? createTarget("portrait-blink") : void 0;
    const portraitLipSync = style.portrait?.lipSync ? createTarget("portrait-lip-sync") : void 0;
    const portraitMask = style.portrait ? createTarget("portrait-corner-mask") : void 0;
    const text = createTarget("text");
    const continueIndicator = style.continueIndicator ? createTarget("continue-indicator") : void 0;
    const targets = Object.freeze({
      text,
      ...portraitBase ? { portraitBase } : {},
      ...portraitBlink ? { portraitBlink } : {},
      ...portraitLipSync ? { portraitLipSync } : {},
      ...continueIndicator ? { continueIndicator } : {}
    });
    const layerTargets = /* @__PURE__ */ new Map();
    if (portraitBase) layerTargets.set("portraitBase", portraitBase);
    if (portraitBlink) layerTargets.set("portraitBlink", portraitBlink);
    if (portraitLipSync) layerTargets.set("portraitLipSync", portraitLipSync);
    if (continueIndicator) layerTargets.set("continueIndicator", continueIndicator);
    const layerVisibility = /* @__PURE__ */ new Map();
    let surfaceVisible = false;
    let disposed = false;
    let cachedBodySkinSignature = "";
    let cachedPortraitMaskSignature = "";
    let currentStyle = style;
    let reservedTextSize;
    const layoutPositions = /* @__PURE__ */ new Map();
    const layoutScales = /* @__PURE__ */ new Map();
    let motionTranslation = [0, 0];
    let motionScaleMultiplier = 1;
    let motionOpacity = 1;
    let shapeTransition;
    let scratchTextLayout;
    let scratchPointsLeft = false;
    const applyMotionTransforms = () => {
      for (const target of drawables) {
        const basePosition = layoutPositions.get(target.drawableID);
        if (basePosition) renderer.updateDrawablePosition(target.drawableID, [basePosition[0] + motionTranslation[0], basePosition[1] + motionTranslation[1]]);
        const baseScale = layoutScales.get(target.drawableID);
        if (baseScale) renderer.updateDrawableScale(target.drawableID, [baseScale[0] * motionScaleMultiplier, baseScale[1] * motionScaleMultiplier]);
        renderer.updateDrawableEffect?.(target.drawableID, "ghost", (1 - motionOpacity) * 100);
      }
    };
    const updateVisibility = () => {
      const actorVisible = currentStyle.placement.basis === "background" || actor.visible !== false;
      const scratchDefaultRendered = currentStyle.layoutProfile === "scratch-default" && scratchTextLayout !== void 0;
      renderer.updateDrawableVisible(body.drawableID, surfaceVisible && actorVisible && (scratchDefaultRendered || currentStyle.visualStyle !== "NO_BUBBLE") && (renderer.updateDrawableEffect !== void 0 || motionOpacity > 0));
      renderer.updateDrawableVisible(text.drawableID, surfaceVisible && actorVisible && !scratchDefaultRendered && (renderer.updateDrawableEffect !== void 0 || motionOpacity > 0));
      for (const [layer, target] of layerTargets) renderer.updateDrawableVisible(target.drawableID, surfaceVisible && actorVisible && (layerVisibility.get(layer) ?? false) && (renderer.updateDrawableEffect !== void 0 || motionOpacity > 0));
      if (portraitMask) renderer.updateDrawableVisible(portraitMask.drawableID, surfaceVisible && actorVisible && currentStyle.portrait !== void 0 && currentStyle.portrait.cornerRadius > 0 && currentStyle.visualStyle !== "NO_BUBBLE" && (layerVisibility.get("portraitBase") ?? false) && (renderer.updateDrawableEffect !== void 0 || motionOpacity > 0));
      applyMotionTransforms();
      runtime.requestRedraw?.();
    };
    const position = () => {
      if (disposed) return;
      if (currentStyle.layoutProfile === "scratch-default" && scratchTextLayout !== void 0) {
        const nativeSize = renderer.getNativeSize();
        const stageWidth = Array.isArray(nativeSize) && Number(nativeSize[0]) > 0 ? Number(nativeSize[0]) : 480;
        const stageHeight = Array.isArray(nativeSize) && Number(nativeSize[1]) > 0 ? Number(nativeSize[1]) : 360;
        const metrics = scratchBubbleMetrics(scratchTextLayout);
        const nextPosition = positionScratchBubble({
          bounds: targetBounds(actor),
          height: metrics.height,
          pointsLeft: scratchPointsLeft,
          stageHeight,
          stageWidth,
          width: metrics.width
        });
        scratchPointsLeft = nextPosition.pointsLeft;
        const nextBodySkinSignature = JSON.stringify({
          kind,
          layout: scratchTextLayout,
          pointsLeft: scratchPointsLeft
        });
        if (nextBodySkinSignature !== cachedBodySkinSignature) {
          const nextSkinId = renderer.createSVGSkin(renderScratchBubbleSvg({
            kind,
            layout: scratchTextLayout,
            pointsLeft: scratchPointsLeft,
            title: `${currentStyle.name} ${kind} Bubble`
          }));
          if (!Number.isInteger(nextSkinId) || nextSkinId < 0) throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-001", "TurboWarp did not create the Scratch-compatible Bubble SVG skin.");
          try {
            renderer.updateDrawableSkinId(body.drawableID, nextSkinId);
          } catch (error) {
            renderer.destroySkin(nextSkinId);
            throw error;
          }
          const previousBodySkinId = bodySkinId;
          bodySkinId = nextSkinId;
          cachedBodySkinSignature = nextBodySkinSignature;
          if (previousBodySkinId !== void 0) renderer.destroySkin(previousBodySkinId);
        }
        renderer.updateDrawableScale(body.drawableID, [100, 100]);
        renderer.updateDrawablePosition(body.drawableID, [nextPosition.centerX, nextPosition.centerY]);
        layoutPositions.set(body.drawableID, [nextPosition.centerX, nextPosition.centerY]);
        layoutScales.set(body.drawableID, [100, 100]);
        updateVisibility();
        return;
      }
      const scaleMultiplier = currentStyle.placement.basis === "actor" ? currentStyle.offset.scalePercent / 100 : 1;
      const nativeTextSize = reservedTextSize ?? readSize(renderer, text, {
        width: 180,
        height: 48
      });
      renderer.updateDrawableScale(text.drawableID, [scaleMultiplier * 100, scaleMultiplier * 100]);
      const textSize = {
        width: nativeTextSize.width * scaleMultiplier,
        height: nativeTextSize.height * scaleMultiplier
      };
      const portraitFitBoxSize = portraitBoxSize * ((currentStyle.portrait?.offset.zoomPercent ?? 100) / 100);
      const hasPortrait = portraitBase !== void 0 && currentStyle.portrait !== void 0;
      const portraitSize = hasPortrait ? fitDrawable(renderer, portraitBase, portraitFitBoxSize, scaleMultiplier) : {
        width: 0,
        height: 0,
        scalePercent: 0
      };
      const portraitLayerScales = /* @__PURE__ */ new Map();
      if (hasPortrait) portraitLayerScales.set(portraitBase.drawableID, portraitSize.scalePercent);
      for (const target of [portraitBlink, portraitLipSync]) if (target && hasPortrait) {
        const fitted = fitDrawable(renderer, target, portraitFitBoxSize, scaleMultiplier);
        portraitLayerScales.set(target.drawableID, fitted.scalePercent);
      }
      const indicatorSize = continueIndicator ? fitDrawable(renderer, continueIndicator, indicatorBoxSize, scaleMultiplier) : {
        width: 0,
        height: 0,
        scalePercent: 0
      };
      const totalWidth = portraitSize.width + (hasPortrait ? contentGap * scaleMultiplier : 0) + textSize.width;
      const contentHeight = Math.max(portraitSize.height, textSize.height);
      const { width: baseBubbleWidth, height: baseBubbleHeight } = bubbleBodySizeForContent({
        contentWidth: totalWidth / scaleMultiplier,
        contentHeight: contentHeight / scaleMultiplier,
        styles: [currentStyle.visualStyle, ...shapeTransition === void 0 ? [] : [shapeTransition.from, shapeTransition.to]]
      });
      const bubbleWidth = Math.max(totalWidth, (baseBubbleWidth - 48) * scaleMultiplier);
      const bubbleHeight = Math.max(contentHeight, (baseBubbleHeight - 48) * scaleMultiplier);
      const nativeSize = renderer.getNativeSize();
      const stageWidth = Array.isArray(nativeSize) && Number(nativeSize[0]) > 0 ? Number(nativeSize[0]) : 480;
      const stageHeight = Array.isArray(nativeSize) && Number(nativeSize[1]) > 0 ? Number(nativeSize[1]) : 360;
      const stageLeft = -stageWidth / 2;
      const stageRight = stageWidth / 2;
      const stageTop = stageHeight / 2;
      const stageBottom = -stageHeight / 2;
      const minimumCenterX = stageLeft + bubbleWidth / 2;
      const maximumCenterX = stageRight - bubbleWidth / 2;
      const minimumCenterY = stageBottom + bubbleHeight / 2;
      const maximumCenterY = stageTop - bubbleHeight / 2;
      let centerX;
      let centerY;
      if (currentStyle.placement.basis === "background") {
        centerX = 0;
        if (currentStyle.placement.region === "HEADER_LIKE") centerY = stageTop - stageSafeMargin - bubbleHeight / 2;
        else if (currentStyle.placement.region === "FOOTER_LIKE") centerY = stageBottom + stageSafeMargin + bubbleHeight / 2;
        else centerY = 0;
      } else {
        const center = actorRelativeBubbleCenter({
          bounds: targetBounds(actor),
          bubbleWidth,
          bubbleHeight,
          direction: currentStyle.placement.direction,
          distance: currentStyle.distance,
          tailLength: currentStyle.tailLength,
          offset: currentStyle.offset
        });
        centerX = center.x;
        centerY = center.y;
      }
      centerX = clamp(centerX, minimumCenterX, maximumCenterX);
      centerY = clamp(centerY, minimumCenterY, maximumCenterY);
      const tailDirection = currentStyle.placement.basis === "actor" ? tailDirectionForPlacement(currentStyle.placement.direction) : null;
      const bodyOffset = currentStyle.placement.basis === "actor" ? [
        currentStyle.offset.x,
        currentStyle.offset.y,
        currentStyle.offset.scalePercent
      ] : [
        0,
        0,
        100
      ];
      const bodyCenterOffset = tailDirection === null ? {
        x: 0,
        y: 0
      } : bubbleBodyCenterOffset({
        style: currentStyle.visualStyle,
        width: baseBubbleWidth,
        height: baseBubbleHeight,
        tailDirection,
        tailLength: currentStyle.tailLength,
        offset: bodyOffset
      });
      const viewportExtraX = Math.abs(bodyOffset[0]) + baseBubbleWidth * Math.abs(scaleMultiplier - 1) + Math.max(0, currentStyle.tailLength - 18) + 8;
      const viewportExtraY = Math.abs(bodyOffset[1]) + baseBubbleHeight * Math.abs(scaleMultiplier - 1) + Math.max(0, currentStyle.tailLength - 18) + 8;
      const nextBodySkinSignature = JSON.stringify({
        baseBubbleHeight,
        baseBubbleWidth,
        bodyOffset,
        tailDirection,
        tailLength: currentStyle.tailLength,
        viewportExtraX,
        viewportExtraY,
        visualStyle: currentStyle.visualStyle,
        shapeTransition
      });
      if (nextBodySkinSignature !== cachedBodySkinSignature) {
        const expanded = expandSvgViewport(renderBubbleSvg({
          style: currentStyle.visualStyle,
          lines: [],
          width: baseBubbleWidth,
          height: baseBubbleHeight,
          tailDirection,
          tailLength: currentStyle.tailLength,
          offset: bodyOffset,
          title: `${currentStyle.name} Bubble body`,
          ...shapeTransition === void 0 ? {} : { shapeTransition }
        }), baseBubbleWidth, baseBubbleHeight, viewportExtraX, viewportExtraY);
        const nextSkinId = renderer.createSVGSkin(expanded);
        if (!Number.isInteger(nextSkinId) || nextSkinId < 0) throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-001", "TurboWarp did not create the Bubble body SVG skin.");
        try {
          renderer.updateDrawableSkinId(body.drawableID, nextSkinId);
        } catch (error) {
          renderer.destroySkin(nextSkinId);
          throw error;
        }
        const previousBodySkinId = bodySkinId;
        bodySkinId = nextSkinId;
        cachedBodySkinSignature = nextBodySkinSignature;
        if (previousBodySkinId !== void 0) renderer.destroySkin(previousBodySkinId);
      }
      renderer.updateDrawableScale(body.drawableID, [100, 100]);
      renderer.updateDrawablePosition(body.drawableID, [centerX - bodyCenterOffset.x, centerY + bodyCenterOffset.y]);
      const left = centerX - totalWidth / 2;
      const portraitPlacement = currentStyle.portrait?.placement ?? "left";
      const portraitOnRight = portraitPlacement.endsWith("right");
      const portraitOffsetX = (currentStyle.portrait?.offset.x ?? 0) * scaleMultiplier;
      const portraitOffsetY = (currentStyle.portrait?.offset.y ?? 0) * scaleMultiplier;
      const portraitX = (portraitOnRight ? left + textSize.width + contentGap * scaleMultiplier : left) + portraitSize.width / 2 + portraitOffsetX;
      let portraitY = centerY;
      if (portraitPlacement.startsWith("top-")) portraitY = centerY + contentHeight / 2 - portraitSize.height / 2;
      else if (portraitPlacement.startsWith("bottom-")) portraitY = centerY - contentHeight / 2 + portraitSize.height / 2;
      portraitY += portraitOffsetY;
      const textX = (portraitOnRight || !hasPortrait ? left : left + portraitSize.width + contentGap * scaleMultiplier) + textSize.width / 2;
      for (const target of [
        portraitBase,
        portraitBlink,
        portraitLipSync
      ]) if (target) renderer.updateDrawablePosition(target.drawableID, [portraitX, portraitY]);
      if (portraitMask) {
        const maskWidth = portraitSize.width / scaleMultiplier;
        const maskHeight = portraitSize.height / scaleMultiplier;
        const radius = Math.min(currentStyle.portrait?.cornerRadius ?? 0, maskWidth / 2, maskHeight / 2);
        const nextPortraitMaskSignature = radius > 0 ? JSON.stringify({
          maskHeight,
          maskWidth,
          radius
        }) : "";
        if (nextPortraitMaskSignature !== cachedPortraitMaskSignature) {
          const previousPortraitMaskSkinId = portraitMaskSkinId;
          portraitMaskSkinId = void 0;
          cachedPortraitMaskSignature = nextPortraitMaskSignature;
          if (radius > 0) {
            const nextSkinId = renderer.createSVGSkin(renderPortraitCornerMaskSvg(maskWidth, maskHeight, radius));
            if (!Number.isInteger(nextSkinId) || nextSkinId < 0) throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-001", "TurboWarp did not create the Bubble portrait corner mask SVG skin.");
            try {
              renderer.updateDrawableSkinId(portraitMask.drawableID, nextSkinId);
              portraitMaskSkinId = nextSkinId;
            } catch (error) {
              renderer.destroySkin(nextSkinId);
              throw error;
            }
          }
          if (previousPortraitMaskSkinId !== void 0) renderer.destroySkin(previousPortraitMaskSkinId);
        }
        renderer.updateDrawablePosition(portraitMask.drawableID, [portraitX, portraitY]);
      }
      renderer.updateDrawablePosition(text.drawableID, [textX, centerY]);
      if (continueIndicator) renderer.updateDrawablePosition(continueIndicator.drawableID, [textX + textSize.width / 2 - indicatorSize.width / 2 - contentGap * scaleMultiplier, centerY - textSize.height / 2 + indicatorSize.height / 2 + contentGap * scaleMultiplier]);
      const remember = (target, positionValue) => {
        if (!target) return;
        layoutPositions.set(target.drawableID, positionValue);
      };
      remember(body, [centerX - bodyCenterOffset.x, centerY + bodyCenterOffset.y]);
      remember(text, [textX, centerY]);
      remember(portraitBase, [portraitX, portraitY]);
      remember(portraitBlink, [portraitX, portraitY]);
      remember(portraitLipSync, [portraitX, portraitY]);
      remember(portraitMask, [portraitX, portraitY]);
      layoutScales.set(body.drawableID, [100, 100]);
      layoutScales.set(text.drawableID, [scaleMultiplier * 100, scaleMultiplier * 100]);
      for (const target of [
        portraitBase,
        portraitBlink,
        portraitLipSync
      ]) {
        if (!target) continue;
        const portraitScale = portraitLayerScales.get(target.drawableID) ?? 0;
        layoutScales.set(target.drawableID, [portraitScale, portraitScale]);
      }
      if (portraitMask) layoutScales.set(portraitMask.drawableID, [scaleMultiplier * 100, scaleMultiplier * 100]);
      if (continueIndicator) layoutScales.set(continueIndicator.drawableID, [indicatorSize.scalePercent, indicatorSize.scalePercent]);
      if (continueIndicator) remember(continueIndicator, [textX + textSize.width / 2 - indicatorSize.width / 2 - contentGap * scaleMultiplier, centerY - textSize.height / 2 + indicatorSize.height / 2 + contentGap * scaleMultiplier]);
      applyMotionTransforms();
      updateVisibility();
    };
    const originalVisualChange = actor.onTargetVisualChange;
    const visualChangeHook = (changedTarget) => {
      originalVisualChange?.(changedTarget);
      position();
    };
    const nativeSizeHook = () => position();
    if (currentStyle.placement.basis === "actor") actor.onTargetVisualChange = visualChangeHook;
    renderer.on?.("NativeSizeChanged", nativeSizeHook);
    return Object.freeze({
      targets,
      setLayerVisible(layer, visible) {
        if (disposed) return;
        layerVisibility.set(layer, visible);
        updateVisibility();
      },
      updateStyle(nextStyle) {
        if (disposed) return;
        const wasActorRelative = currentStyle.placement.basis === "actor";
        currentStyle = nextStyle;
        motionTranslation = [0, 0];
        motionScaleMultiplier = 1;
        motionOpacity = 1;
        shapeTransition = void 0;
        if (nextStyle.reveal?.layout !== "RESERVED") reservedTextSize = void 0;
        const isActorRelative = currentStyle.placement.basis === "actor";
        if (wasActorRelative && !isActorRelative) {
          if (actor.onTargetVisualChange === visualChangeHook) actor.onTargetVisualChange = originalVisualChange ?? null;
        } else if (!wasActorRelative && isActorRelative) actor.onTargetVisualChange = visualChangeHook;
        position();
      },
      captureTextLayout() {
        if (disposed) return;
        reservedTextSize = readSize(renderer, text, {
          width: 180,
          height: 48
        });
        position();
      },
      clearTextLayout() {
        reservedTextSize = void 0;
        position();
      },
      renderScratchText(layout) {
        if (disposed) return;
        scratchTextLayout = layout;
        cachedBodySkinSignature = "";
        position();
      },
      async animate(motion) {
        if (disposed) return;
        const durationSeconds = Math.max(0, motion.durationSeconds ?? 0);
        const setFrame = () => {
          if (disposed) return;
          applyMotionTransforms();
          updateVisibility();
        };
        const eased = (progress) => easeMotionProgress(progress, motion.ease ?? "easeInOut");
        if (motion.name === "fadeIn" || motion.name === "floatIn" || motion.name === "zoomIn" || motion.name === "riseUp") {
          surfaceVisible = true;
          const startingTranslation = motion.name === "floatIn" || motion.name === "riseUp" ? [0, 16] : [0, 0];
          const startingScale = motion.name === "zoomIn" ? .01 : 1;
          motionTranslation = startingTranslation;
          motionScaleMultiplier = startingScale;
          motionOpacity = motion.name === "fadeIn" ? 0 : 1;
          setFrame();
          await runMotionTimeline(scheduler, durationSeconds, (progress) => {
            const easedProgress = eased(progress);
            motionTranslation = [startingTranslation[0] * (1 - easedProgress), startingTranslation[1] * (1 - easedProgress)];
            motionScaleMultiplier = startingScale + (1 - startingScale) * easedProgress;
            motionOpacity = motion.name === "fadeIn" ? easedProgress : 1;
            setFrame();
          });
          motionTranslation = [0, 0];
          motionScaleMultiplier = 1;
          motionOpacity = 1;
          position();
          return;
        }
        if (motion.name === "fadeOut" || motion.name === "floatOut" || motion.name === "zoomOut" || motion.name === "sink") {
          const endingTranslation = motion.name === "floatOut" || motion.name === "sink" ? [0, -16] : [0, 0];
          const endingScale = motion.name === "zoomOut" ? .01 : 1;
          motionTranslation = [0, 0];
          motionScaleMultiplier = 1;
          motionOpacity = 1;
          setFrame();
          await runMotionTimeline(scheduler, durationSeconds, (progress) => {
            const easedProgress = eased(progress);
            motionTranslation = [endingTranslation[0] * easedProgress, endingTranslation[1] * easedProgress];
            motionScaleMultiplier = 1 + (endingScale - 1) * easedProgress;
            motionOpacity = motion.name === "fadeOut" ? 1 - easedProgress : 1;
            setFrame();
          });
          motionTranslation = endingTranslation;
          motionScaleMultiplier = endingScale;
          motionOpacity = motion.name === "fadeOut" ? 0 : 1;
          setFrame();
          surfaceVisible = false;
          updateVisibility();
          motionTranslation = [0, 0];
          motionScaleMultiplier = 1;
          motionOpacity = 1;
          return;
        }
        if (motion.name === "shake") {
          const count = Math.max(1, Math.floor(motion.count ?? 1));
          const animationDuration = durationSeconds > 0 ? durationSeconds : count * .08;
          const vector = bubbleDirectionVector(typeof motion.direction === "number" ? motion.direction : motion.direction ?? "right") ?? bubbleDirectionVector("right");
          const amplitude = 5;
          motionTranslation = [0, 0];
          await runMotionTimeline(scheduler, animationDuration, (progress) => {
            const phase = eased(progress) * count * Math.PI * 2;
            const displacement = Math.sin(phase) * amplitude;
            motionTranslation = [vector.x * displacement, vector.y * displacement];
            setFrame();
          });
          motionTranslation = [0, 0];
          position();
          return;
        }
        if (motion.name === "explode") {
          const count = Math.max(1, Math.floor(motion.count ?? 1));
          const animationDuration = durationSeconds > 0 ? durationSeconds : count * .12;
          const factor = motion.relativeScale ?? 1.15;
          await runMotionTimeline(scheduler, animationDuration, (progress) => {
            const easedProgress = eased(progress);
            const wave = Math.abs(Math.sin(easedProgress * count * Math.PI));
            motionScaleMultiplier = 1 + (factor - 1) * wave;
            setFrame();
          });
          motionScaleMultiplier = 1;
          position();
          return;
        }
        if (motion.name === "animateBubbleShape") {
          const targetStyle = motion.visualStyle ?? currentStyle.visualStyle;
          const fromStyle = currentStyle.visualStyle;
          const speed = motion.speed === void 0 ? 1 : Math.max(0, motion.speed);
          shapeTransition = {
            from: fromStyle,
            to: targetStyle,
            progress: 0
          };
          position();
          await runMotionTimeline(scheduler, durationSeconds, (progress) => {
            const speedProgress = durationSeconds === 0 ? 1 : clampMotionProgress(progress * Math.max(speed, 1) / 1);
            shapeTransition = {
              from: fromStyle,
              to: targetStyle,
              progress: easeMotionProgress(speedProgress, motion.ease ?? "easeInOut")
            };
            position();
          });
          shapeTransition = void 0;
          position();
          return;
        }
      },
      show() {
        if (disposed) return;
        surfaceVisible = true;
        position();
      },
      hide() {
        if (disposed) return;
        surfaceVisible = false;
        updateVisibility();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        renderer.off?.("NativeSizeChanged", nativeSizeHook);
        if (currentStyle.placement.basis === "actor" && actor.onTargetVisualChange === visualChangeHook) actor.onTargetVisualChange = originalVisualChange ?? null;
        for (const target of [...drawables].reverse()) renderer.destroyDrawable(target.drawableID, spriteLayer);
        if (bodySkinId !== void 0) {
          renderer.destroySkin(bodySkinId);
          bodySkinId = void 0;
        }
        if (portraitMaskSkinId !== void 0) {
          renderer.destroySkin(portraitMaskSkinId);
          portraitMaskSkinId = void 0;
        }
        runtime.requestRedraw?.();
      }
    });
  } catch (error) {
    for (const target of [...drawables].reverse()) renderer.destroyDrawable(target.drawableID, spriteLayer);
    if (bodySkinId !== void 0) renderer.destroySkin(bodySkinId);
    if (portraitMaskSkinId !== void 0) renderer.destroySkin(portraitMaskSkinId);
    throw error;
  }
}
function createTurboWarpBubbleComposition(runtimeInput, options = {}) {
  if (!isRecord(runtimeInput)) throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-001", "Bubble requires the TurboWarp runtime.");
  const runtime = runtimeInput;
  const renderer = requireRenderer(runtime.renderer);
  const requestedBackend = normalizeRenderBackend(options.bubbleRenderBackend);
  let overlayTextCapability;
  let overlayTextCapabilityError;
  if (requestedBackend === "svg-overlay") {
    if (options.svgOverlayTextCapability !== void 0) overlayTextCapability = options.svgOverlayTextCapability;
    else if (runtime.ext_kubohiroyasvgtext === void 0) overlayTextCapability = createDefaultSvgOverlayTextCapability();
    else try {
      overlayTextCapability = createTurboWarpSvgTextOverlayTextCapability(runtime.ext_kubohiroyasvgtext);
    } catch (error) {
      overlayTextCapabilityError = error instanceof Error ? error.message : String(error);
    }
  }
  const unsupportedBehavior = normalizeOverlayUnsupportedBehavior(options.svgOverlayUnsupportedBehavior);
  const overlayDocument = requestedBackend === "svg-overlay" ? resolveOverlayDocument(options.document) : void 0;
  const unavailableReason = requestedBackend === "svg-overlay" ? overlayTextCapabilityError ?? overlayUnavailableReason(renderer, overlayDocument, overlayTextCapability) : void 0;
  if (requestedBackend === "svg-overlay" && unavailableReason !== void 0 && unsupportedBehavior === "error") throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-004", `Bubble SVG overlay backend is unavailable because ${unavailableReason}. Use scratch-render or install the required public upstream capability.`);
  const renderBackend = requestedBackend === "svg-overlay" && unavailableReason === void 0 ? "svg-overlay" : "scratch-render";
  const scheduler = options.scheduler ?? {
    setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    clearTimeout: (handle) => globalThis.clearTimeout(handle)
  };
  const getRuntimeAssetExtension = () => runtime.ext_kubohiroyaassetcache ?? runtime.ext_kubohiroyaassetmanager;
  const getAssetExtension = () => requireAssetManager(getRuntimeAssetExtension());
  let assetManagerDOMImages;
  const getAssetManagerDOMImages = () => {
    assetManagerDOMImages ?? (assetManagerDOMImages = requireAssetManagerDOMImageCapability(getRuntimeAssetExtension()));
    return assetManagerDOMImages;
  };
  let textCapability;
  if (renderBackend === "svg-overlay") try {
    textCapability = createSvgOverlayTextAdapter(overlayTextCapability, renderer);
  } catch (error) {
    throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-004", `Bubble SVG overlay text capability is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  else if (options.textCapability !== void 0) textCapability = options.textCapability;
  else try {
    textCapability = runtime.ext_kubohiroyasvgtext === void 0 ? createDefaultScratchRenderTextCapability(runtime) : createTurboWarpSvgTextCapability(runtime.ext_kubohiroyasvgtext);
  } catch (error) {
    throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-003", `Bubble could not initialize the scratch-render text provider: ${error instanceof Error ? error.message : String(error)}`);
  }
  let imageResolver;
  if (renderBackend === "svg-overlay") try {
    imageResolver = createSvgOverlayImageAdapter(options.svgOverlayImageCapability ?? createAssetManagerSvgOverlayImageCapability(Object.freeze({
      isRegistered(name) {
        return getAssetManagerDOMImages().isRegistered(name);
      },
      getMimeType(name) {
        return getAssetManagerDOMImages().getMimeType(name);
      },
      resolveDOMImageResource(name) {
        return getAssetManagerDOMImages().resolveDOMImageResource(name);
      }
    })));
  } catch (error) {
    throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-004", `Bubble SVG overlay image capability is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  else imageResolver = options.imageResolver ?? {
    isRegistered(name) {
      return getAssetExtension().isLoaded({ NAME: name });
    },
    getMimeType(name) {
      return getAssetExtension().getAssetMimeType({ NAME: name });
    },
    async applyToTarget(name, target) {
      const drawableID = target.drawableID;
      if (!Number.isInteger(drawableID) || drawableID < 0) throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-001", "Bubble image target drawable is invalid.");
      const skin = await getAssetExtension().resolveSkin(name);
      if (!isRecord(skin) || !Number.isInteger(skin.skinId) || skin.skinId < 0) throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-002", `Asset Manager did not resolve an image skin: ${String(name)}`);
      renderer.updateDrawableSkinId(drawableID, skin.skinId);
      runtime.requestRedraw?.();
    }
  };
  const audio = options.audio ?? {
    isRegistered(name) {
      return getAssetExtension().isLoaded({ NAME: name });
    },
    getMimeType(name) {
      return getAssetExtension().getAssetMimeType({ NAME: name });
    },
    async playSound(name, playOptions = {}) {
      const extension = getAssetExtension();
      const method = playOptions.untilDone ? extension?.playSoundUntilDone : extension?.playSound;
      if (typeof method !== "function") throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-002", "TurboWarp-Asset-Manager does not provide audio playback.");
      await method.call(extension, { NAME: name });
    }
  };
  const overlayManager = renderBackend === "svg-overlay" ? createSvgOverlaySurfaceManager(renderer, overlayDocument) : void 0;
  return createBubbleComposition({
    ...imageResolver === void 0 ? {} : { imageResolver },
    audio,
    textCapability,
    createSurface({ actor, actorKey, kind, style }) {
      if (!isRecord(actor) || typeof actor.id !== "string") throw new BubbleRuntimeAdapterError("BUBBLE-RUNTIME-001", "Bubble actor target is invalid.");
      return renderBackend === "svg-overlay" ? createSvgOverlaySurface(overlayManager, actor, actorKey, kind, style, scheduler) : createSurface(runtime, actor, actorKey, kind, style, scheduler);
    },
    ...options.scheduler === void 0 ? {} : { scheduler: options.scheduler },
    ...options.onAnimationError === void 0 ? {} : { onAnimationError: options.onAnimationError }
  });
}
//#endregion
//#region src/extension.ts
var blockDefinitions = block_definitions_default$1.blocks;
var definitionMenus = block_definitions_default$1.menus;
var validAnimationModes = /* @__PURE__ */ new Set([
  "idle",
  "talking",
  "awaiting-continue"
]);
var validClosePolicyTriggers = /* @__PURE__ */ new Set([
  "condition",
  "timeout",
  "condition-or-timeout"
]);
var validRevealUnits = /* @__PURE__ */ new Set([
  "CHARACTER",
  "WORD",
  "LINE",
  "BLOCK"
]);
var showMotionNames = /* @__PURE__ */ new Set([
  "fadeIn",
  "floatIn",
  "zoomIn",
  "riseUp"
]);
var hideMotionNames = /* @__PURE__ */ new Set([
  "fadeOut",
  "floatOut",
  "zoomOut",
  "sink"
]);
var motionNames = /* @__PURE__ */ new Set([
  ...showMotionNames,
  ...hideMotionNames,
  "shake",
  "explode",
  "animateBubbleShape"
]);
var easeNames = /* @__PURE__ */ new Set([
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut"
]);
var builtInBubbleStyles = Object.freeze([Object.freeze({
  name: "say",
  textStyle: "default"
}), Object.freeze({
  name: "think",
  textStyle: "default"
})]);
var EXTENSION_DOCS_URI = "https://kubohiroya.github.io/turbowarp-bubble/";
var EXTENSION_VERSION = "0.22.0";
var BLOCK_ICON_URI = extensionConfig$1.blockIconURI;
function extensionError(message) {
  const error = /* @__PURE__ */ new Error(`[Bubble] ${message}`);
  Object.defineProperty(error, "code", { value: "BUBBLE-EXTENSION-001" });
  return error;
}
var BubbleExtension = class {
  constructor(runtime = Scratch.vm?.runtime, options = {}) {
    _defineProperty(this, "runtime", void 0);
    _defineProperty(this, "options", void 0);
    _defineProperty(this, "styles", new Map(builtInBubbleStyles.map((style) => [style.name, style])));
    _defineProperty(this, "closePolicies", /* @__PURE__ */ new Map());
    _defineProperty(this, "handles", /* @__PURE__ */ new Map());
    _defineProperty(this, "waits", /* @__PURE__ */ new Map());
    _defineProperty(this, "waitScheduler", void 0);
    _defineProperty(this, "composition", null);
    _defineProperty(this, "disposed", false);
    _defineProperty(this, "fixedEditorsDispose", void 0);
    if (!runtime) throw extensionError("TurboWarp runtime is unavailable.");
    this.runtime = runtime;
    this.options = options;
    this.waitScheduler = options.scheduler ?? Object.freeze({
      setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
      clearTimeout: (handle) => globalThis.clearTimeout(handle)
    });
    const releaseAll = () => {
      this.releaseAll().catch(() => void 0);
    };
    const releaseTarget = (target) => {
      if (this.isTarget(target)) this.releaseOwnedTarget(target.id).catch(() => void 0);
    };
    runtime.on?.("PROJECT_START", releaseAll);
    runtime.on?.("PROJECT_STOP_ALL", releaseAll);
    runtime.on?.("STOP_FOR_TARGET", releaseTarget);
    runtime.on?.("RUNTIME_DISPOSED", () => {
      this.resetForProject().catch(() => void 0);
    });
  }
  getInfo() {
    if (!this.disposed) this.fixedEditorsDispose ?? (this.fixedEditorsDispose = registerFixedInputEditors$1(Scratch, this.runtime));
    return {
      id: extensionConfig$1.id,
      name: Scratch.translate(block_definitions_default$1.extensionName),
      docsURI: EXTENSION_DOCS_URI,
      blockIconURI: BLOCK_ICON_URI,
      color1: "#ff6680",
      color2: "#e64d6a",
      color3: "#b83255",
      blocks: blockDefinitions.map((block) => this.toScratchBlock(block)),
      menus: definitionMenus
    };
  }
  defineBubbleStyle(args) {
    const name = this.requireName(args.STYLE, "style");
    const style = Object.freeze({
      name,
      textStyle: this.requireName(args.TEXT_STYLE, "text style")
    });
    this.installStyle(style);
  }
  defineBubbleClosePolicy(args) {
    const name = this.requireName(args.POLICY, "close policy");
    const trigger = this.toString(args.TRIGGER).trim().toLowerCase();
    if (!validClosePolicyTriggers.has(trigger)) throw extensionError("close policy trigger must be condition, timeout, or condition-or-timeout.");
    const usesCondition = trigger !== "timeout";
    const usesTimeout = trigger !== "condition";
    const condition = usesCondition ? this.toString(args.CONDITION).trim() : void 0;
    if (usesCondition && !condition) throw extensionError("close policy condition is empty.");
    const timeoutSeconds = usesTimeout ? Scratch.Cast.toNumber(args.TIMEOUT) : void 0;
    if (usesTimeout && (!Number.isFinite(timeoutSeconds) || Number(timeoutSeconds) <= 0)) throw extensionError("close policy timeout must be greater than zero when enabled.");
    this.closePolicies.set(name, Object.freeze({
      name,
      trigger,
      ...condition === void 0 ? {} : { condition },
      ...timeoutSeconds === void 0 ? {} : { timeoutSeconds: Number(timeoutSeconds) }
    }));
  }
  setPortraitBase(args) {
    const style = this.requireStyle(args.STYLE);
    const base = this.toString(args.ASSET).trim();
    const nextStyle = base ? Object.freeze({
      ...style,
      portrait: {
        ...style.portrait,
        base
      }
    }) : (() => {
      const { portrait, ...withoutPortrait } = style;
      return Object.freeze(withoutPortrait);
    })();
    this.installStyle(nextStyle);
  }
  setPortraitLayout(args) {
    const style = this.requireStyle(args.STYLE);
    if (this.toString(args.PLACEMENT).trim().toLowerCase() === "none") {
      const { portrait, ...withoutPortrait } = style;
      this.installStyle(Object.freeze(withoutPortrait));
      return;
    }
    if (!style.portrait?.base) throw extensionError("set the portrait base before portrait layout.");
    let placement;
    let offset;
    let cornerRadius;
    try {
      placement = normalizeBubblePortraitPlacement(args.PLACEMENT);
      offset = normalizeBubblePortraitOffset([
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.ZOOM)
      ]);
      cornerRadius = normalizeBubblePortraitCornerRadius(Scratch.Cast.toNumber(args.RADIUS));
    } catch (error) {
      throw extensionError(error instanceof Error ? error.message : "Bubble portrait layout is invalid.");
    }
    this.installStyle(Object.freeze({
      ...style,
      portrait: Object.freeze({
        ...style.portrait,
        placement,
        offset: Object.freeze([
          offset.x,
          offset.y,
          offset.zoomPercent
        ]),
        cornerRadius
      })
    }));
  }
  setBubblePlacement(args) {
    const style = this.requireStyle(args.STYLE);
    let placement;
    try {
      placement = normalizeBubblePlacement(args.PLACEMENT);
    } catch (error) {
      throw extensionError(error instanceof Error ? error.message : "placement is invalid.");
    }
    this.installStyle(Object.freeze({
      ...style,
      placement: this.placementInput(placement)
    }));
  }
  setBubbleDistance(args) {
    const style = this.requireStyle(args.STYLE);
    this.installStyle(Object.freeze({
      ...style,
      distance: this.normalizeTransformNumber(args.DISTANCE, normalizeBubbleDistance)
    }));
  }
  setBubbleVisualStyle(args) {
    const style = this.requireStyle(args.STYLE);
    const visualStyle = this.toString(args.VISUAL_STYLE).trim().toUpperCase();
    if (!bubbleVisualStyles.includes(visualStyle)) throw extensionError(`unsupported Bubble visual style: ${visualStyle}`);
    this.installStyle(Object.freeze({
      ...style,
      visualStyle
    }));
  }
  setBubbleTailLength(args) {
    const style = this.requireStyle(args.STYLE);
    this.installStyle(Object.freeze({
      ...style,
      tailLength: this.normalizeTransformNumber(args.LENGTH, normalizeBubbleTailLength)
    }));
  }
  setBubbleOffset(args) {
    const style = this.requireStyle(args.STYLE);
    let offset;
    try {
      offset = normalizeBubbleOffset([
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.SCALE)
      ]);
    } catch (error) {
      throw extensionError(error instanceof Error ? error.message : "Bubble offset is invalid.");
    }
    this.installStyle(Object.freeze({
      ...style,
      offset: Object.freeze([
        offset.x,
        offset.y,
        offset.scalePercent
      ])
    }));
  }
  setBlinkFrames(args) {
    this.setPortraitAnimation("blink", args);
  }
  setLipSyncFrames(args) {
    this.setPortraitAnimation("lipSync", args);
  }
  setContinueFrames(args) {
    const style = this.requireStyle(args.STYLE);
    const frames = this.parseFrames(args.ASSETS);
    if (frames.length === 1) throw extensionError("continue frames must contain at least two assets.");
    const continueIndicator = frames.length === 0 ? void 0 : this.animationInput(frames, args.SECONDS, "continue");
    const { continueIndicator: previousContinue, ...withoutContinue } = style;
    const nextStyle = Object.freeze({
      ...withoutContinue,
      ...continueIndicator ? { continueIndicator } : {}
    });
    this.installStyle(nextStyle);
  }
  setBubbleReveal(args) {
    const style = this.requireStyle(args.STYLE);
    const unit = this.toString(args.UNIT).trim().toUpperCase();
    if (!validRevealUnits.has(unit)) throw extensionError("reveal unit must be CHARACTER, WORD, LINE, or BLOCK.");
    const seconds = Scratch.Cast.toNumber(args.SECONDS);
    if (!Number.isFinite(seconds) || seconds < 0) throw extensionError("reveal interval must be zero or greater.");
    const layout = this.toString(args.LAYOUT).trim().toUpperCase();
    if (layout !== "DYNAMIC" && layout !== "RESERVED") throw extensionError("reveal layout must be DYNAMIC or RESERVED.");
    const previous = style.reveal;
    const reveal = Object.freeze({
      unit,
      ...previous?.delimiters === void 0 ? {} : { delimiters: previous.delimiters },
      ...previous?.showDelimiters === void 0 ? {} : { showDelimiters: previous.showDelimiters },
      layout,
      intervalSeconds: seconds,
      ...previous?.sound === void 0 ? {} : { sound: previous.sound }
    });
    this.installStyle(Object.freeze({
      ...style,
      reveal
    }));
  }
  setBubbleWordDelimiters(args) {
    const style = this.requireStyle(args.STYLE);
    const delimiters = this.toString(args.DELIMITERS);
    if (!delimiters) throw extensionError("word delimiters are empty.");
    const show = this.toString(args.SHOW).trim().toLowerCase();
    if (show !== "true" && show !== "false") throw extensionError("show delimiters must be true or false.");
    const previous = style.reveal;
    const reveal = Object.freeze({
      unit: previous?.unit ?? "WORD",
      delimiters,
      showDelimiters: show === "true",
      ...previous?.layout === void 0 ? {} : { layout: previous.layout },
      ...previous?.intervalSeconds === void 0 ? {} : { intervalSeconds: previous.intervalSeconds },
      ...previous?.sound === void 0 ? {} : { sound: previous.sound }
    });
    this.installStyle(Object.freeze({
      ...style,
      reveal
    }));
  }
  setBubbleRevealSound(args) {
    const style = this.requireStyle(args.STYLE);
    const asset = this.toString(args.ASSET).trim();
    const audio = style.audio;
    const nextAudio = asset ? Object.freeze({
      ...audio ?? {},
      reveal: asset
    }) : (() => {
      if (!audio) return void 0;
      const { reveal, ...withoutReveal } = audio;
      return Object.freeze(withoutReveal);
    })();
    this.installStyle(Object.freeze({
      ...style,
      ...nextAudio === void 0 ? {} : { audio: nextAudio }
    }));
  }
  setBubbleVoice(args) {
    const style = this.requireStyle(args.STYLE);
    const asset = this.toString(args.ASSET).trim();
    const audio = style.audio;
    const nextAudio = asset ? Object.freeze({
      ...audio ?? {},
      voice: asset
    }) : (() => {
      if (!audio) return void 0;
      const { voice, ...withoutVoice } = audio;
      return Object.freeze(withoutVoice);
    })();
    this.installStyle(Object.freeze({
      ...style,
      ...nextAudio === void 0 ? {} : { audio: nextAudio }
    }));
  }
  setBubbleShowAnimation(args) {
    const style = this.requireStyle(args.STYLE);
    const motion = this.motionInput(args.MOTION, args.SECONDS, "show", showMotionNames);
    this.installStyle(Object.freeze({
      ...style,
      showAnimation: motion
    }));
  }
  setBubbleHideAnimation(args) {
    const style = this.requireStyle(args.STYLE);
    const motion = this.motionInput(args.MOTION, args.SECONDS, "hide", hideMotionNames);
    this.installStyle(Object.freeze({
      ...style,
      hideAnimation: motion
    }));
  }
  async animateBubble(args, util) {
    const handle = this.requireHandle(util);
    const name = this.toString(args.MOTION).trim();
    if (!motionNames.has(name)) throw extensionError("unsupported Bubble motion.");
    await handle.animate({ name });
  }
  async shakeBubble(args, util) {
    const handle = this.requireHandle(util);
    const count = Scratch.Cast.toNumber(args.COUNT);
    if (!Number.isInteger(count) || count < 1) throw extensionError("shake count must be a positive integer.");
    const ease = this.toString(args.EASE).trim();
    if (!easeNames.has(ease)) throw extensionError("unsupported easing.");
    await handle.animate({
      name: "shake",
      direction: Scratch.Cast.toNumber(args.DIRECTION),
      count,
      ease
    });
  }
  async explodeBubble(args, util) {
    const handle = this.requireHandle(util);
    const scale = Scratch.Cast.toNumber(args.SCALE);
    const count = Scratch.Cast.toNumber(args.COUNT);
    if (!Number.isFinite(scale) || scale <= 0) throw extensionError("explode scale must be positive.");
    if (!Number.isInteger(count) || count < 1) throw extensionError("explode count must be a positive integer.");
    const ease = this.toString(args.EASE).trim();
    if (!easeNames.has(ease)) throw extensionError("unsupported easing.");
    await handle.animate({
      name: "explode",
      relativeScale: scale,
      count,
      ease
    });
  }
  async animateBubbleShape(args, util) {
    const handle = this.requireHandle(util);
    const visualStyle = this.toString(args.VISUAL_STYLE).trim().toUpperCase();
    if (!bubbleVisualStyles.includes(visualStyle)) throw extensionError("unsupported Bubble visual style.");
    const speed = Scratch.Cast.toNumber(args.SPEED);
    const seconds = Scratch.Cast.toNumber(args.SECONDS);
    if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(seconds) || seconds < 0) throw extensionError("shape animation speed and duration must be zero or greater.");
    await handle.animate({
      name: "animateBubbleShape",
      visualStyle,
      speed,
      durationSeconds: seconds
    });
  }
  say(args, util) {
    return this.show("say", Object.freeze({
      MESSAGE: args.MESSAGE,
      STYLE: "say"
    }), util);
  }
  think(args, util) {
    return this.show("think", Object.freeze({
      MESSAGE: args.MESSAGE,
      STYLE: "think"
    }), util);
  }
  showWithBubbleStyle(args, util) {
    const style = this.requireStyle(args.STYLE);
    return this.show(style.name === "think" ? "think" : "say", args, util);
  }
  sayWithBubbleStyle(args, util) {
    return this.show("say", args, util);
  }
  thinkWithBubbleStyle(args, util) {
    return this.show("think", args, util);
  }
  async setBubbleAnimationMode(args, util) {
    const target = this.requireTarget(util);
    const mode = this.toString(args.MODE).trim().toLowerCase();
    if (!validAnimationModes.has(mode)) throw extensionError("animation mode must be talking, awaiting-continue, or idle.");
    const handle = this.handles.get(target.id);
    if (!handle) throw extensionError("this target does not have an active bubble.");
    await handle.setAnimationMode(mode);
  }
  async waitForBubbleContinue(args, util) {
    const target = this.requireTarget(util);
    const handle = this.handles.get(target.id);
    if (!handle) throw extensionError("this target does not have an active bubble.");
    const condition = this.toString(args.CONDITION).trim();
    if (!condition) throw extensionError("wait condition is empty.");
    const timeoutSeconds = Scratch.Cast.toNumber(args.TIMEOUT);
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0) throw extensionError("wait timeout must be zero or greater.");
    await this.waitForBubbleTrigger({
      targetId: target.id,
      handle,
      condition,
      ...timeoutSeconds === 0 ? {} : { timeoutSeconds },
      setAwaitingContinue: true,
      restoreIdle: true,
      requireAsyncInput: true
    });
  }
  async waitAndCloseBubbleWithPolicy(args, util) {
    const target = this.requireTarget(util);
    const handle = this.handles.get(target.id);
    if (!handle) throw extensionError("this target does not have an active bubble.");
    const policy = this.requireClosePolicy(args.POLICY);
    const usesCondition = policy.condition !== void 0;
    await this.waitForBubbleTrigger({
      targetId: target.id,
      handle,
      ...policy.condition === void 0 ? {} : { condition: policy.condition },
      ...policy.timeoutSeconds === void 0 ? {} : { timeoutSeconds: policy.timeoutSeconds },
      setAwaitingContinue: usesCondition,
      restoreIdle: false,
      requireAsyncInput: usesCondition
    });
    if (this.handles.get(target.id) !== handle) throw this.abortError("Bubble was replaced before it could close.");
    await this.releaseOwnedTarget(target.id);
  }
  async finishBubbleReveal(args, util) {
    const handle = this.requireHandle(util);
    const unit = this.toString(args.UNIT).trim().toUpperCase();
    if (!validRevealUnits.has(unit)) throw extensionError("reveal unit is invalid.");
    const conditionText = this.toString(args.CONDITION).trim();
    const timeoutSeconds = Scratch.Cast.toNumber(args.TIMEOUT);
    if (!conditionText) throw extensionError("finish condition is empty.");
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0) throw extensionError("finish timeout must be zero or greater.");
    const expression = this.runtime.ext_kubohiroyaruntimeexpression;
    if (!this.isRecord(expression) || typeof expression.runtimeCondition !== "function") throw extensionError("Bubble finish requires Runtime Expression. Load @kubohiroya/turbowarp-runtime-expression before using this block.");
    await handle.finish({
      unit,
      timeoutSeconds,
      condition: () => expression.runtimeCondition({ EXPRESSION: conditionText })
    });
  }
  async closeBubble(_args, util) {
    const target = this.requireTarget(util);
    await this.releaseOwnedTarget(target.id);
  }
  getVersion() {
    return EXTENSION_VERSION;
  }
  async releaseAll() {
    this.cancelAllWaits("Bubble waits were released.");
    if (!this.composition) return;
    await this.composition.releaseAll();
    this.handles.clear();
  }
  async dispose() {
    this.fixedEditorsDispose?.();
    await this.disposeBubbles();
  }
  async resetForProject() {
    if (this.disposed) return;
    this.cancelAllWaits("Bubble project was unloaded.");
    const composition = this.composition;
    this.composition = null;
    this.handles.clear();
    this.styles.clear();
    for (const style of builtInBubbleStyles) this.styles.set(style.name, style);
    this.closePolicies.clear();
    if (composition) await composition.dispose();
  }
  async disposeBubbles() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelAllWaits("Bubble extension was disposed.");
    if (this.composition) await this.composition.dispose();
    this.handles.clear();
    this.styles.clear();
    this.closePolicies.clear();
  }
  async waitForBubbleTrigger(input) {
    let runtimeExpression;
    if (input.condition !== void 0) {
      if (input.requireAsyncInput && !this.isRecord(this.runtime.ext_kubohiroyaasyncinput)) throw extensionError("Bubble wait requires Async Input. Load @kubohiroya/turbowarp-async-input before using this block.");
      const candidate = this.runtime.ext_kubohiroyaruntimeexpression;
      if (!this.isRecord(candidate) || typeof candidate.runtimeCondition !== "function") throw extensionError("Bubble wait requires Runtime Expression. Load @kubohiroya/turbowarp-runtime-expression before using this block.");
      if (typeof this.runtime.on !== "function" || typeof this.runtime.off !== "function") throw extensionError("TurboWarp runtime events are unavailable.");
      runtimeExpression = candidate;
    }
    if (input.condition === void 0 && input.timeoutSeconds === void 0) throw extensionError("Bubble wait does not have an enabled trigger.");
    this.cancelWait(input.targetId, "Bubble wait was replaced.");
    if (input.setAwaitingContinue) await input.handle.setAnimationMode("awaiting-continue");
    await new Promise((resolve, reject) => {
      let settled = false;
      let timeoutHandle;
      const checkCondition = () => {
        if (input.condition === void 0 || runtimeExpression === void 0) return;
        try {
          if (runtimeExpression.runtimeCondition({ EXPRESSION: input.condition })) finish();
        } catch (error) {
          finish(error instanceof Error ? error : extensionError("wait condition evaluation failed."));
        }
      };
      const cleanup = () => {
        if (input.condition !== void 0) this.runtime.off?.("BEFORE_EXECUTE", checkCondition);
        if (timeoutHandle !== void 0) this.waitScheduler.clearTimeout(timeoutHandle);
        if (this.waits.get(input.targetId) === pending) this.waits.delete(input.targetId);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        if (!input.restoreIdle) {
          resolve();
          return;
        }
        input.handle.setAnimationMode("idle").then(resolve, reject);
      };
      const pending = Object.freeze({ cancel: finish });
      this.waits.set(input.targetId, pending);
      if (input.condition !== void 0) this.runtime.on?.("BEFORE_EXECUTE", checkCondition);
      if (input.timeoutSeconds !== void 0) timeoutHandle = this.waitScheduler.setTimeout(() => finish(), input.timeoutSeconds * 1e3);
      checkCondition();
    });
  }
  toScratchBlock(block) {
    return {
      opcode: block.opcode,
      blockType: Scratch.BlockType[block.blockType],
      text: Scratch.translate(block.text),
      ...block.hideFromPalette === true ? { hideFromPalette: true } : {},
      arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, {
        type: Scratch.ArgumentType[argument.type],
        defaultValue: argument.defaultValue,
        ...argument.menu === void 0 ? {} : { menu: argument.menu }
      }]))
    };
  }
  toString(value) {
    return Scratch.Cast.toString(value);
  }
  isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  abortError(message) {
    const error = extensionError(message);
    error.name = "AbortError";
    return error;
  }
  cancelWait(targetId, message) {
    this.waits.get(targetId)?.cancel(this.abortError(message));
  }
  cancelAllWaits(message) {
    for (const targetId of [...this.waits.keys()]) this.cancelWait(targetId, message);
  }
  requireName(value, label) {
    const name = this.toString(value).trim();
    if (!name) throw extensionError(`${label} name is empty.`);
    return name;
  }
  requireStyle(value) {
    const name = this.requireName(value, "style");
    const style = this.styles.get(name);
    if (!style) throw extensionError(`bubble style is not defined: ${name}`);
    return style;
  }
  requireClosePolicy(value) {
    const name = this.requireName(value, "close policy");
    const policy = this.closePolicies.get(name);
    if (!policy) throw extensionError(`bubble close policy is not defined: ${name}`);
    return policy;
  }
  normalizeTransformNumber(value, normalize) {
    try {
      return normalize(Scratch.Cast.toNumber(value));
    } catch (error) {
      throw extensionError(error instanceof Error ? error.message : "Bubble transform value is invalid.");
    }
  }
  installStyle(style) {
    this.styles.set(style.name, style);
    this.composition?.defineStyle(style);
  }
  parseFrames(value) {
    const text = this.toString(value).trim();
    if (!text) return [];
    const frames = text.split(",").map((frame) => frame.trim()).filter(Boolean);
    if (frames.length === 0) throw extensionError("frame asset list is empty.");
    return frames;
  }
  animationInput(frames, secondsValue, label) {
    const seconds = Scratch.Cast.toNumber(secondsValue);
    if (!Number.isFinite(seconds) || seconds <= 0) throw extensionError(`${label} frame interval must be greater than zero.`);
    return Object.freeze({
      frames: Object.freeze(frames),
      frameIntervalSeconds: seconds
    });
  }
  motionInput(value, secondsValue, label, valid) {
    const name = this.toString(value).trim();
    if (!valid.has(name)) throw extensionError(`${label} animation is invalid.`);
    const seconds = Scratch.Cast.toNumber(secondsValue);
    if (!Number.isFinite(seconds) || seconds < 0) throw extensionError(`${label} animation duration must be zero or greater.`);
    return Object.freeze({
      name,
      durationSeconds: seconds
    });
  }
  setPortraitAnimation(field, args) {
    const style = this.requireStyle(args.STYLE);
    const portrait = style.portrait;
    if (!portrait?.base) throw extensionError("set the portrait base before portrait animation frames.");
    const frames = this.parseFrames(args.ASSETS);
    const animation = frames.length === 0 ? void 0 : this.animationInput(frames, args.SECONDS, field);
    const { blink, lipSync, ...portraitLayout } = portrait;
    const nextPortrait = Object.freeze({
      ...portraitLayout,
      ...field === "blink" ? {
        ...animation ? { blink: animation } : {},
        ...lipSync ? { lipSync } : {}
      } : {
        ...blink ? { blink } : {},
        ...animation ? { lipSync: animation } : {}
      }
    });
    this.installStyle(Object.freeze({
      ...style,
      portrait: nextPortrait
    }));
  }
  isTarget(value) {
    return typeof value === "object" && value !== null && typeof value.id === "string" && typeof value.isStage === "boolean";
  }
  requireTarget(util) {
    const target = util?.target;
    if (!this.isTarget(target)) throw extensionError("target is unavailable.");
    return target;
  }
  requireHandle(util) {
    const target = this.requireTarget(util);
    const handle = this.handles.get(target.id);
    if (!handle) throw extensionError("this target does not have an active bubble.");
    return handle;
  }
  placementInput(placement) {
    return placement.basis === "actor" ? placement.direction : placement.region;
  }
  getComposition() {
    if (this.disposed) throw extensionError("extension is disposed.");
    if (!this.composition) {
      this.composition = createTurboWarpBubbleComposition(this.runtime, this.options);
      for (const style of this.styles.values()) this.composition.defineStyle(style);
    }
    return this.composition;
  }
  async show(kind, args, util) {
    const style = this.requireStyle(args.STYLE);
    const target = this.requireTarget(util);
    const placement = normalizeBubblePlacement(style.placement ?? "up-right");
    if (target.isStage && placement.basis === "actor") throw extensionError("actor-relative bubble placement requires a sprite or clone.");
    this.cancelWait(target.id, "Bubble wait was replaced.");
    const scratchDefault = isScratchDefaultBubbleStyleInput(style);
    const message = scratchDefault ? formatScratchBubbleArgument(args.MESSAGE) : this.toString(args.MESSAGE);
    if (scratchDefault && message === "") {
      await this.releaseOwnedTarget(target.id);
      return;
    }
    const composition = this.getComposition();
    let handle;
    try {
      handle = await composition.show({
        actor: target,
        actorKey: target.id,
        kind,
        text: message,
        styleName: style.name
      });
    } catch (error) {
      if (!composition.hasActiveBubble(target.id)) this.handles.delete(target.id);
      throw error;
    }
    if (composition.hasActiveBubble(target.id)) this.handles.set(target.id, handle);
  }
  async releaseOwnedTarget(targetId) {
    this.cancelWait(targetId, "Bubble wait was released.");
    this.handles.delete(targetId);
    if (this.composition) await this.composition.releaseTarget(targetId);
  }
};
//#endregion
//#region src/index.ts
if (extensionConfig$1.unsandboxed && !Scratch.extensions.unsandboxed) throw new Error(`${extensionConfig$1.name} must run unsandboxed.`);
Scratch.extensions.register(new BubbleExtension());
//#endregion

})(Scratch);
