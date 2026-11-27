# pixefy me 🎨

> turn your sketches into 3d character artwork 

https://github.com/user-attachments/assets/d2552907-fe48-4443-ac41-b0ff62318587

---

## ✨ features

| feature | what you can do | 
| --- | --- | 
| 🎨 drawing canvas | sketch from scratch with a brush, eraser, undo, and redo controls or upload a photo. |
| 🖼️ character artwork | guide the character’s colours, expression, and accessories with written instructions. |
| 🧊 3d preview | turn the generated artwork into a 3D model |
| 🎞️ transformation replay | scrub from the original sketch to the finished model |

## 🚀 local setup

### prerequisites

- git to clone the repository
- python 3 (tested with Python 3.14.6)
- an OpenAI API key for generating character artwork
- a hugging face access token for generating 3D models

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

create a file named `.env` in the same folder as `app.py`. add these two lines and replace the placeholders with your own credentials:

```dotenv
OPENAI_API_KEY=your_openai_api_key
HF_TOKEN=your_hugging_face_token
```

```bash 
cp .env.example .env
```

pixefy uses `OPENAI_API_KEY` to generate character artwork and `HF_TOKEN` to turn that artwork into a 3D model. keep your `.env` file private.

### 4. start the studio

with the virtual environment active, run:

```bash
python -m flask --app app run --port 5001
```

open [pixefy in your browser](http://127.0.0.1:5001/static/index.html). draw a stroke and click **undo** to check that the canvas works.

press `Ctrl+C` in the terminal to stop the server.