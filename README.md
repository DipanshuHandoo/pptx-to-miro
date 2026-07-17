# PPTX → Miro

Convert a PowerPoint `.pptx` file into native Miro board elements (shapes, text,
connectors, images) via the Miro REST API v2.

Two decoupled layers, one JSON contract:

```
.pptx ──► python/parser.py ──► output/extraction.json ──► node/src/cli.js ──► Miro REST API v2
          (python-pptx + lxml)      (the contract)          (mapper + client)
```

- **`python/`** — parses the deck and writes `extraction.json`. Owns all
  PPTX/XML knowledge (theme colors, groups, connector topology).
- **`node/`** — reads the JSON, maps each element to a Miro payload, and pushes
  it. Owns all Miro API knowledge (auth, rate limiting, retries).

The Node CLI spawns the Python parser as a child process, then drives the API.

---

## Prerequisites

- Python 3.9+
- Node.js 18+
- A Miro account with a developer app + access token

---

## Setup

### 1. Python parser

```bash
cd python
python -m venv venv
# Windows:  venv\Scripts\activate
# macOS/Linux:  source venv/bin/activate
pip install -r requirements.txt
```

### 2. Node pusher

```bash
cd node
npm install
cp .env.example .env   # then edit .env
```

### 3. Miro credentials

1. Create an app at <https://developers.miro.com>.
2. Enable the `boards:read` and `boards:write` scopes.
3. Install the app on your target board and generate an access token.
4. Copy the board id from its URL: `https://miro.com/app/board/{BOARD_ID}/`.
5. Put both into `node/.env`:

   ```
   MIRO_ACCESS_TOKEN=...
   MIRO_BOARD_ID=...
   ```

> If `python` isn't the right command on your machine, set `PYTHON_BIN` in
> `node/.env` (e.g. `PYTHON_BIN=python3`).

---

## Usage

### Quick start (recommended)

From the project root, `run.sh` activates the Python venv and runs the CLI in one
step (no `PYTHON_BIN` juggling). All arguments are forwarded to the CLI:

```bash
./run.sh --file ./decks/workflow.pptx --dry-run
./run.sh --file ./decks/workflow.pptx
./run.sh --file ./decks/workflow.pptx --slide 2

# Wipe the board first, then push (avoids duplicates on re-runs):
./run.sh --file ./decks/workflow.pptx --clear
```

> **`--clear` deletes ALL items on the target board**, not just ones this tool
> created. Miro has no bulk "clear board" endpoint, so it deletes each item
> individually (parallelized). Without `--clear`, runs are **additive** — pushing
> the same deck twice creates duplicates.

### Slides & frames

By default each slide is wrapped in its own **frame** (a slide container) and the
frames are laid out left-to-right in a row, so multi-slide decks never overlap.
All shapes/text/images become children of their slide's frame.

```bash
# Default: one frame per slide, in a row:
./run.sh --file ./decks/deck.pptx --clear

# Wider spacing between slides (pt):
./run.sh --file ./decks/deck.pptx --clear --gap 400

# No frames — items are still offset per slide so they don't overlap:
./run.sh --file ./decks/deck.pptx --clear --no-frames
```

> Miro's own `slide_container` (from the Slides feature) cannot be created via the
> REST API — it's an "unsupported" item type. Frames are the supported equivalent:
> a titled, movable, collapsible boundary.

### Local preview (no Miro needed)

Render the parsed deck to a local HTML preview that reuses the real mapper, so it
shows what will be pushed (positions, sizes, text anchoring, z-order) without
touching Miro:

```bash
./run.sh --file ./decks/deck.pptx --preview   # writes output/preview.html
```

To view it in a browser, serve the output dir:

```bash
cd node && npm run serve        # http://localhost:5599
```

> The preview uses the browser's Arial metrics, which are close to but not
> identical to Miro's text rendering — use it for layout/sizing/stacking checks.

### Manual

Or run from the `node/` directory directly.

```bash
# Parse + map only, no API calls (validate the extraction first):
node src/cli.js --file ../decks/workflow.pptx --dry-run

# Full run: parse and push to the board in .env:
node src/cli.js --file ../decks/workflow.pptx

# Only one slide:
node src/cli.js --file ../decks/workflow.pptx --slide 2

# Custom output location for extraction.json + extracted images:
node src/cli.js --file ../decks/workflow.pptx --output ./output
```

You can also run the parser on its own:

```bash
cd python
python parser.py ../decks/workflow.pptx ../node/output
# prints the absolute path to extraction.json
```

---

## How it maps

| PPTX | Miro |
|---|---|
| Auto shapes (rectangle, oval, diamond, …) | `shape` items (`rectangle`, `circle`, `rhombus`, …) |
| Text boxes / placeholders | `text` items |
| Connectors (`cxnSp`) | `connector` items, attached to shapes by id |
| Pictures (png/jpg/gif/svg/…) | `image` items (multipart upload) |
| Theme colors (accent1, tx1, …) | resolved to hex via the deck theme + color map |
| Grouped shapes | flattened, with group transform applied |
| Each slide | a `frame` (slide container), laid out in a row (unless `--no-frames`) |

### Coordinates

PPTX is top-left origin (points); Miro is center origin.

- **Framed (default):** items are children of their slide's frame, positioned
  relative to the frame's top-left — i.e. the PPTX coordinates directly.
- **`--no-frames`:** each element's top-left box is converted to a center point
  and offset by half the slide, then shifted by a per-slide X offset so slides
  sit side by side.

---

## Known limitations

| Area | Behavior |
|---|---|
| **Connectors** | Miro cannot create free-floating connectors — both ends must attach to an item. Endpoints with no explicit PPTX connection are inferred to the nearest shape; if none is close enough, the connector is **skipped** (logged). |
| **EMF / WMF images** | Not supported by Miro. Extracted to disk but skipped on upload (logged). |
| **Gradient fills** | Approximated with the first gradient stop color. |
| **Per-run text styling** | Miro shape text is single-style; the first run's font/color/size is used. Bold/italic/underline are preserved inline via HTML. |
| **Fonts** | Mapped to Miro's `arial` (Miro supports only a fixed font set). |
| **Curved connectors** | Rendered as straight. |
| **Miro `slide_container`** | Cannot be created via REST API; frames are used instead. |

---

## Project layout

```
PPTX-to-MIRO/
├── python/
│   ├── requirements.txt
│   ├── parser.py                 # entry point: pptx -> extraction.json
│   └── extractors/
│       ├── colors.py             # theme color resolution
│       ├── text.py               # text frame -> runs + Miro-safe HTML
│       ├── shapes.py             # geometry, type, fill, border
│       ├── connectors.py         # connector topology via raw XML
│       └── images.py             # picture blobs -> disk
├── node/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── cli.js                # commander entry point + orchestration
│       ├── runner.js             # spawns the Python parser
│       ├── mapper/               # pptx json -> miro payloads (shapes, connectors, coordinates)
│       └── miro/                 # api client + create calls (shapes, connectors, images, frames, clear)
├── run.sh                        # venv + CLI in one step
└── docs/
    └── pptx-to-miro-plan.md
```
