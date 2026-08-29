const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Armazenamento robusto: mantém o arquivo principal no userData do Windows
// e uma cópia de segurança na pasta do projeto quando ela for gravável.
const dataName = 'tutas-joias.json';
const userDataFile = path.join(app.getPath('userData'), dataName);
const documentsDir = path.join(app.getPath('documents'), 'Tutas Joias');
const documentsFile = path.join(documentsDir, dataName);
const projectFile = path.join(__dirname, 'dados', dataName);

function emptyData() { return { p: [] }; }
function normalizeData(data) {
  if (!data || !Array.isArray(data.p)) return emptyData();
  data.p = data.p.map(x => ({
    id: Number(x.id) || Date.now() + Math.floor(Math.random() * 100000),
    c: String(x.c ?? ''),
    n: String(x.n ?? ''),
    cat: String(x.cat ?? ''),

    tipoEtiqueta: String(x.tipoEtiqueta ?? 'preco'),
    referencia: String(x.referencia ?? ''),

    pre: Number(x.pre) || 0,
    q: Math.max(0, Number(x.q) || 0),
    min: Math.max(0, Number(x.min) || 0)
}));
  return data;
}
function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return normalizeData(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (_) { return null; }
}
function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (_) { return false; }
}
function loadData() {
  const candidates = [userDataFile, documentsFile, projectFile]
    .map(file => ({ file, data: readJson(file) }))
    .filter(x => x.data);
  if (!candidates.length) return emptyData();

  // Prefere o arquivo com mais produtos; em caso de empate, userData.
  candidates.sort((a, b) => {
    const n = b.data.p.length - a.data.p.length;
    if (n !== 0) return n;
    return [userDataFile, documentsFile, projectFile].indexOf(a.file) - [userDataFile, documentsFile, projectFile].indexOf(b.file);
  });
  return candidates[0].data;
}
function saveData(data) {
  data = normalizeData(data);
  // Sempre tenta salvar no userData. As outras duas são cópias de segurança.
  const results = [writeJson(userDataFile, data), writeJson(documentsFile, data), writeJson(projectFile, data)];
  if (!results.some(Boolean)) throw new Error('Não foi possível gravar o estoque em nenhum local.');
  return true;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f5f5f7',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

function checkForUpdates() {

    if (!app.isPackaged) {
        console.log('Atualização ignorada: programa não está empacotado.');
        return;
    }

    console.log('--------------------------------');
    console.log('INICIANDO VERIFICAÇÃO DE ATUALIZAÇÃO');
    console.log('Versão instalada:', app.getVersion());
    console.log('--------------------------------');

    autoUpdater.on('checking-for-update', () => {
        console.log('Verificando atualização no GitHub...');
    });

    autoUpdater.on('update-available', (info) => {
        console.log('ATUALIZAÇÃO ENCONTRADA!');
        console.log('Versão disponível:', info.version);
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log('Nenhuma atualização disponível.');
        console.log('Versão informada pelo servidor:', info.version);
    });

    autoUpdater.on('download-progress', (progress) => {
        console.log(
            'Download:',
            Math.round(progress.percent) + '%'
        );
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('ATUALIZAÇÃO BAIXADA!');
        console.log('Versão:', info.version);
    });

    autoUpdater.on('error', (error) => {
        console.error('ERRO NO ATUALIZADOR:');
        console.error(error);
    });

    autoUpdater.checkForUpdates()
        .then(result => {
            console.log('Verificação concluída.');

            if (result && result.updateInfo) {
                console.log(
                    'Versão encontrada:',
                    result.updateInfo.version
                );
            }
        })
        .catch(error => {
            console.error(
                'FALHA AO VERIFICAR ATUALIZAÇÃO:',
                error
            );
        });
}
app.whenReady().then(() => {
  ipcMain.handle('load-data', () => loadData());
  ipcMain.handle('save-data', (_, data) => saveData(data));
  ipcMain.handle('printer-list', async () => {
    const wins = BrowserWindow.getAllWindows();
    return wins.length ? await wins[0].webContents.getPrintersAsync() : [];
  });
  ipcMain.handle('print-labels', async (_, html, copies) => {
    const printWin = new BrowserWindow({
        show: false,
        webPreferences: {
            sandbox: true
        }
    });

    try {
        const logoPath = path.join(__dirname, 'Logo Horizontal Preta@2x.png');

        if (fs.existsSync(logoPath)) {
            const logoBase64 = fs.readFileSync(logoPath).toString('base64');

            html = html.replace(
                /src=["'](?:file:\/\/\/)?[^"']*Logo%20Horizontal%20Preta@2x\.png["']/gi,
                `src="data:image/png;base64,${logoBase64}"`
            );

            html = html.replace(
                /src=["'](?:file:\/\/\/)?[^"']*Logo Horizontal Preta@2x\.png["']/gi,
                `src="data:image/png;base64,${logoBase64}"`
            );
        }

        await printWin.loadURL(
            'data:text/html;charset=utf-8,' + encodeURIComponent(html)
        );

        return await new Promise(resolve => {
            printWin.webContents.print({
                silent: false,
                printBackground: true,
                copies: Number(copies) || 1,
                margins: {
                    marginType: 'none'
                }
            }, (success, reason) => {
                printWin.close();
                resolve({ success, reason });
            });
        });

    } catch (e) {
        try {
            printWin.close();
        } catch (_) {}

        return {
            success: false,
            reason: e.message
        };
    }
});

createWindow();

setTimeout(() => {
    checkForUpdates();
}, 1000);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
