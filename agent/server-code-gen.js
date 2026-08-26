/* ============================================================
   MarinaAI — Code Generation Tool

   Template-based code generation for autonomous file creation.
   Generates structured projects from specifications.
   ============================================================ */

const CRYPTO = require("crypto");
const FS = require("fs");
const PATH = require("path");

const TEMPLATES_DIR = PATH.join(__dirname, "..", "templates");
const MAX_FILE_SIZE = 100 * 1024; // 100KB per file
const MAX_FILES = 50;

/**
 * Built-in project templates
 */
const BUILTIN_TEMPLATES = {
  "node-cli": {
    name: "Node.js CLI Application",
    description: "Command-line interface with commander.js",
    files: [
      {
        path: "package.json",
        template: `{
  "name": "{{name}}",
  "version": "1.0.0",
  "description": "{{description}}",
  "main": "dist/index.js",
  "bin": {
    "{{name}}": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "test": "jest"
  },
  "dependencies": {
    "commander": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}`,
      },
      {
        path: "tsconfig.json",
        template: `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`,
      },
      {
        path: "src/index.ts",
        template: `#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("{{name}}")
  .description("{{description}}")
  .version("1.0.0");

program
  .command("hello")
  .description("Say hello")
  .argument("[name]", "Name to greet", "World")
  .action((name) => {
    console.log(\`Hello, \${name}!\`);
  });

program.parse(process.argv);
`,
      },
      {
        path: "README.md",
        template: `# {{name}}

{{description}}

## Installation

\`\`\`bash
npm install
npm run build
\`\`\`

## Usage

\`\`\`bash
npm start hello [name]
\`\`\``,
      },
    ],
  },

  "react-app": {
    name: "React Application (Vite + TypeScript)",
    description: "Modern React app with Vite and Tailwind",
    files: [
      {
        path: "package.json",
        template: `{
  "name": "{{name}}",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}`,
      },
      {
        path: "tsconfig.json",
        template: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}`,
      },
      {
        path: "tsconfig.node.json",
        template: `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}`,
      },
      {
        path: "vite.config.ts",
        template: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
})`,
      },
      {
        path: "index.html",
        template: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{name}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      },
      {
        path: "src/main.tsx",
        template: `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
      },
      {
        path: "src/App.tsx",
        template: `import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>{{name}}</h1>
      <p>{{description}}</p>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
}

export default App;
`,
      },
      {
        path: "src/index.css",
        template: `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}`,
      },
    ],
  },

  "python-fastapi": {
    name: "Python FastAPI Service",
    description: "Async REST API with FastAPI and Pydantic",
    files: [
      {
        path: "pyproject.toml",
        template: `[project]
name = "{{name}}"
version = "1.0.0"
description = "{{description}}"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn[standard]>=0.23.0",
    "pydantic>=2.0.0",
    "pydantic-settings>=2.0.0",
    "httpx>=0.24.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.21.0",
    "httpx>=0.24.0",
    "ruff>=0.0.280",
    "mypy>=1.4.0",
]

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.mypy]
python_version = "3.10"
warn_return_any = true
warn_unused_configs = true
`,
      },
      {
        path: "app/main.py",
        template: `from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="{{name}}", description="{{description}}")

class Item(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    tax: Optional[float] = None

@app.get("/")
async def root():
    return {"message": "Welcome to {{name}}", "description": "{{description}}"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/items/")
async def create_item(item: Item):
    return {"item": item, "message": "Item created successfully"}

@app.get("/items/{item_id}")
async def read_item(item_id: int, q: Optional[str] = None):
    return {"item_id": item_id, "q": q}
`,
      },
      {
        path: "tests/test_main.py",
        template: `import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_create_item():
    response = client.post("/items/", json={
        "name": "Test Item",
        "price": 10.5
    })
    assert response.status_code == 200
    assert response.json()["message"] == "Item created successfully"
`,
      },
      {
        path: "Dockerfile",
        template: `FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`,
      },
      {
        path: "README.md",
        template: `# {{name}}

{{description}}

## Development

\`\`\`bash
pip install -e ".[dev]"
uvicorn app.main:app --reload
\`\`\`

## Docker

\`\`\`bash
docker build -t {{name}} .
docker run -p 8000:8000 {{name}}
\`\`\`

## Testing

\`\`\`bash
pytest
\`\`\`
`,
      },
    ],
  },

  "express-api": {
    name: "Express.js REST API",
    description: "Node.js REST API with Express and TypeScript",
    files: [
      {
        path: "package.json",
        template: `{
  "name": "{{name}}",
  "version": "1.0.0",
  "description": "{{description}}",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node-dev --respawn src/index.ts",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "@types/cors": "^2.8.0",
    "@types/jest": "^29.0.0",
    "typescript": "^5.0.0",
    "ts-node-dev": "^2.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  }
}`,
      },
      {
        path: "tsconfig.json",
        template: `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`,
      },
      {
        path: "src/index.ts",
        template: `import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.get("/api/info", (req, res) => {
  res.json({ name: "{{name}}", description: "{{description}}" });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
      },
    ],
  },
};

/**
 * Generate a project from a template
 */
function generateProject(templateName, variables = {}) {
  const template = BUILTIN_TEMPLATES[templateName];
  if (!template) {
    return { ok: false, message: `Template not found: ${templateName}` };
  }

  const defaults = {
    name: "my-project",
    description: "A generated project",
  };

  const vars = { ...defaults, ...variables };

  // Validate variables
  if (!variables.name || !/^[a-z0-9-]+$/.test(variables.name)) {
    return { ok: false, message: "Invalid project name: use lowercase letters, numbers, and hyphens only" };
  }

  const files = [];

  for (const file of template.files) {
    let content = file.template;
    
    // Replace variables
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`{{${key}}}`, "g");
      content = content.replace(regex, String(value));
    }

    // Check file size
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_SIZE) {
      return { ok: false, message: `File ${file.path} exceeds maximum size` };
    }

    files.push({
      path: file.path,
      content,
    });
  }

  if (files.length > MAX_FILES) {
    return { ok: false, message: `Too many files: ${files.length} > ${MAX_FILES}` };
  }

  return {
    ok: true,
    template: template.name,
    projectName: variables.name,
    files,
    fileCount: files.length,
  };
}

/**
 * Write generated project to disk (for local execution)
 */
function writeProjectToDisk(project, outputDir) {
  if (!project.ok) return project;

  for (const file of project.files) {
    const filePath = PATH.join(outputDir, file.path);
    const dir = PATH.dirname(filePath);
    
    if (!FS.existsSync(dir)) {
      FS.mkdirSync(dir, { recursive: true });
    }
    
    FS.writeFileSync(filePath, file.content, "utf8");
  }

  return { ok: true, outputDir, fileCount: project.files.length };
}

/**
 * Create a ZIP archive of the project (returns base64)
 */
async function createProjectZip(project) {
  const JSZIP = require("jszip");
  const zip = new JSZIP();

  for (const file of project.files) {
    zip.file(file.path, file.content);
  }

  const base64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  
  return {
    ok: true,
    base64,
    filename: `${project.projectName}.zip`,
  };
}

module.exports = {
  BUILTIN_TEMPLATES,
  generateProject,
  writeProjectToDisk,
  createProjectZip,
};