# pixefy me 🎨

> turn your sketches into 3D character artwork 

https://github.com/user-attachments/assets/d2552907-fe48-4443-ac41-b0ff62318587

---

## ✨ features

| feature | what you can do | 
| --- | --- | 
| 🎨 drawing canvas | sketch from scratch with a brush, eraser, undo, and redo controls or upload a photo. |
| 🖼️ character artwork | guide the character’s colours, expression, and accessories with written instructions. |
| 🧊 3d preview | turn the generated artwork into a 3D model |
| 🎞️ transformation replay | scrub from the original sketch to the finished model |

## how it works

1. **sketch → artwork** - browser sens a PNG of the canvas and artist's instructions to a Flask backend. Flask calls OpenAI’s image editing API and returns the character artwork.
2. **artwork → 3D model** — when the artist clicks **generate 3d**, Flask sends the artwork to Stable Fast 3D on Hugging Face. The browser receives a GLB file and displays the model so the artist can rotate it.
3. **sketch → replay** — the browser uses the saved sketch, artwork, and model to render a transformation the artist can scrub through or export as a video.


## 🚀 local setup

### prerequisites

- Git to clone the repository
- Python 3 (tested with Python 3.14.6)
- an OpenAI API key for generating character artwork
- a Hugging Face access token for generating 3D models

### 1. clone the repository

```bash
git clone https://github.com/jensenleedesignstudio/pixefy-me.git
cd pixefy-me
```

### 2. create a virtual environment and install dependencies

From the `pixefy-me` folder, run these commands on macOS or Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

### 3. configure your API keys

on a fresh clone, copy the template to create your local `.env` file:

```bash
cp .env.example .env
```

open `.env` in your editor and fill in the two values:

```dotenv
OPENAI_API_KEY=your_openai_api_key
HF_TOKEN=your_hugging_face_token
```

Pixefy uses the OpenAI key to generate artwork and the Hugging Face token to generate 3D models. Keep `.env` private.

### 4. start the studio

with the virtual environment active, run:

```bash
python -m flask --app app run --port 5001
```

open [pixefy in your browser](http://127.0.0.1:5001/static/index.html). draw a stroke and click **undo** to check that the canvas works.

press `Ctrl+C` in the terminal to stop the server.

## 🧪 testing

from the project root, run the frontend effects test with Node.js and npm:

```bash
npm --prefix effects test
```

this checks how the generation background responds when a request finishes, fails, or overlaps with another request. it also checks reduced-motion behaviour. no API keys are needed for this test.