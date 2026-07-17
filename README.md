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

### Coordinates

PPTX is top-left origin (points); Miro is center origin. Each element's
top-left box is converted to a center point and offset by half the slide so the
slide re-centers on Miro's `(0, 0)`.

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
│       ├── mapper/               # pptx json -> miro payloads
│       └── miro/                 # api client + create calls
└── docs/
    └── pptx-to-miro-plan.md
```
