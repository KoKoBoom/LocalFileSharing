import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import busboy from 'busboy';

const app = express();
const PORT = 8800;

const UPLOAD_DIR = 'uploads';

let clipboardContent = '';
let currentUploadFolder: string | null = null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req: Request, res: Response) => {
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>私家传送站</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; background: #f9f9f9; }
        .card { background: white; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        h2 { margin-top: 0; font-size: 1.5rem; }
        input, textarea, button { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; box-sizing: border-box; }
        button { background-color: #3498db; color: white; border: none; font-weight: bold; cursor: pointer; position: relative; }
        button:hover { background-color: #2980b9; }
        button:disabled { background-color: #95a5a6; cursor: not-allowed; }
        button.loading::after {
            content: '';
            position: absolute;
            width: 16px;
            height: 16px;
            top: 50%;
            left: 50%;
            margin-left: -8px;
            margin-top: -8px;
            border: 2px solid #ffffff;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spinner 0.8s linear infinite;
        }
        @keyframes spinner {
            to { transform: rotate(360deg); }
        }
        .result { margin-top: 16px; padding: 12px; background: #f0f7ff; border-radius: 8px; font-size: 14px; word-break: break-all; }
        #qrcode-container { display: flex; align-items: center; gap: 12px; }
        #qrcode { width: 100px; height: 100px; }
        #qrcode img, #qrcode canvas { width: 100px; height: 100px; display: block; }
    </style>
    <script src="https://cdn.bootcdn.net/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
</head>
<body>
    <div class="card" id="qrcode-container">
        <h2>📱 手机访问</h2>
        <div id="qrcode"></div>
    </div>

    <div class="card">
        <h2>📎 文件互传</h2>
        <form id="uploadForm" enctype="multipart/form-data">
            <input type="file" name="file" id="fileInput" multiple required>
            <button type="submit">发送</button>
        </form>
        <div id="uploadResult" class="result"></div>
        <div id="uploadFolder" class="result" style="background: #e8f5e9; font-family: monospace; word-break: break-all;"></div>
    </div>

    <div class="card">
        <h2>📁 文件列表</h2>
        <button id="listFiles">获取文件列表</button>
        <div id="fileList" class="result"></div>
    </div>

    <div class="card">
        <h2>📋 剪贴板同步</h2>
        <textarea id="clipText" rows="4" placeholder="在这里粘贴或查看文本..."></textarea>
        <button id="syncToServer">📤 发送</button>
        <button id="loadFromServer">📥 获取</button>
        <div id="clipResult" class="result"></div>
    </div>

    <script>
        document.getElementById('uploadForm').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const files = document.getElementById('fileInput').files;
            if (files.length === 0) return;
            
            // 禁用按钮并显示加载动画
            submitBtn.disabled = true;
            submitBtn.classList.add('loading');
            submitBtn.textContent = '上传中...';
            
            try {
                const formData = new FormData();
                for (let i = 0; i < files.length; i++) {
                    formData.append('file', files[i]);
                }
                const res = await fetch('/upload', { method: 'POST', body: formData });
                const data = await res.json();
                document.getElementById('uploadResult').innerHTML = '✅ ' + data.message;
                if (data.folderPath) {
                    document.getElementById('uploadFolder').innerHTML = '当前文件夹: ' + data.folderPath;
                }
                updateFileList();
            } catch (err) {
                document.getElementById('uploadResult').innerHTML = '❌ 上传失败';
            } finally {
                // 恢复按钮状态
                submitBtn.disabled = false;
                submitBtn.classList.remove('loading');
                submitBtn.textContent = '上传到电脑';
            }
        };

        async function updateFileList() {
            const res = await fetch('/files');
            const data = await res.json();
            if (data.files.length === 0) {
                document.getElementById('fileList').innerHTML = '📂 暂无文件';
                return;
            }
            let html = '';
            data.files.forEach(file => {
                html += '<a href="/files/' + encodeURIComponent(file) + '" download style="display: block; padding: 8px; margin: 4px 0; background: #e8f4fd; border-radius: 4px; text-decoration: none; color: #333;">' + file + '</a>';
            });
            document.getElementById('fileList').innerHTML = html;
        }

        document.getElementById('listFiles').onclick = updateFileList;

        document.getElementById('syncToServer').onclick = async () => {
            const text = document.getElementById('clipText').value;
            const res = await fetch('/clipboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) });
            const data = await res.json();
            document.getElementById('clipResult').innerHTML = '✅ ' + data.message;
        };

        document.getElementById('loadFromServer').onclick = async () => {
            const res = await fetch('/clipboard');
            const data = await res.json();
            document.getElementById('clipText').value = data.content;
            document.getElementById('clipResult').innerHTML = '✅ 已同步: ' + data.content.substring(0, 50);
        };

        async function generateQRCode() {
            try {
                const res = await fetch('/api/server-url');
                const data = await res.json();
                const url = data.url;

                const qr = qrcode(0, 'L');
                qr.addData(url);
                qr.make();

                const qrElement = document.getElementById('qrcode');
                qrElement.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
            } catch (e) {
                console.log('QR code generation failed:', e);
            }
        }

        generateQRCode();
    </script>
</body>
</html>
`;
  res.send(htmlContent);
});

app.post('/upload', (req: Request, res: Response) => {
  const timestamp = Date.now();
  currentUploadFolder = path.resolve(__dirname, UPLOAD_DIR, timestamp.toString());
  if (!fs.existsSync(currentUploadFolder)) {
      fs.mkdirSync(currentUploadFolder, { recursive: true });
  }

  const bb = busboy({ headers: req.headers });
  const files: { originalname: string, filename: string }[] = [];
  let uploadFinished = false;

  bb.on('file', (fieldname: string, file: any, info: any) => {
      const { filename } = info;
      const decodedName = Buffer.from(filename, 'latin1').toString('utf8');
      const savePath = path.resolve(currentUploadFolder!, decodedName);
      const writeStream = fs.createWriteStream(savePath);
      file.pipe(writeStream);
      writeStream.on('finish', () => {
          files.push({ originalname: decodedName, filename: decodedName });
      });
  });

  bb.on('field', (fieldname: string, val: string) => {
  });

  bb.on('close', () => {
      if (uploadFinished) return;
      uploadFinished = true;
      if (files.length === 0) {
          return res.status(400).json({ message: '请选择文件' });
      }
      if (currentUploadFolder) {
          return res.json({ filenames: files.map(f => f.originalname), message: '上传成功', folderPath: currentUploadFolder });
      }
      return res.json({ filenames: files.map(f => f.originalname), message: '上传成功' });
  });

  bb.on('error', (err: Error) => {
      if (uploadFinished) return;
      uploadFinished = true;
      console.error('Busboy error:', err);
      res.status(500).json({ message: '上传失败' });
  });

  req.pipe(bb);
});

app.get('/clipboard', (req: Request, res: Response) => {
  return res.json({ content: clipboardContent });
});

app.post('/clipboard', (req: Request, res: Response) => {
  const { content } = req.body;
  clipboardContent = content || '';
  return res.json({ message: '剪贴板已更新' });
});

app.get('/files', (req: Request, res: Response) => {
  if (!currentUploadFolder) {
    return res.json({ files: [] });
  }
  fs.readdir(currentUploadFolder, (err, files) => {
    if (err) {
      return res.json({ files: [] });
    }
    return res.json({ files });
  });
});

app.get('/files/:filename', (req: Request, res: Response) => {
  const filename = decodeURIComponent(req.params.filename as string);
  if (!currentUploadFolder) {
    res.status(404).send('文件不存在');
    return;
  }
  const filePath = path.resolve(__dirname, currentUploadFolder, filename);
  res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent(filename));
  res.sendFile(filePath, (err: Error | undefined) => {
    if (err) {
      const errorCode = (err as any).code;
      if (!res.headersSent && errorCode !== 'ECONNABORTED') {
        console.log('下载失败:', err);
        res.status(404).send('文件不存在');
      }
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`本地IP地址: http://${addr.address}:${PORT}`);
      }
    }
  }
});

app.get('/api/server-url', (req: Request, res: Response) => {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return res.json({ url: `http://${addr.address}:${PORT}` });
      }
    }
  }
  return res.json({ url: `http://localhost:${PORT}` });
});
