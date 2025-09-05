/**
 * LoRA Prompt Maker - Google Apps Script側の受信コード
 * 
 * 【設定手順】
 * 1. https://script.google.com/ にアクセス
 * 2. 新しいプロジェクトを作成
 * 3. このコードをコピー&ペースト
 * 4. 「デプロイ」→「新しいデプロイ」でWebアプリとして公開
 * 5. 実行権限: 自分、アクセス権限: 全員
 * 6. 生成されたURLをクライアント側に設定
 */

// ===== 設定（必要に応じて変更） =====
const CONFIG = {
  // 認証トークン（セキュリティ強化したい場合）
  AUTH_TOKEN: "", // 空文字の場合は認証なし
  
  // Google Driveのフォルダ設定
  BACKUP_FOLDER_NAME: "LoRA_Prompt_Maker_Backups",
  CSV_FOLDER_NAME: "LoRA_Prompt_Maker_CSV",
  PRESET_FOLDER_NAME: "LoRA_Prompt_Maker_Presets",
  
  // スプレッドシート設定
  CREATE_SPREADSHEET: true, // CSVをスプレッドシートとしても保存するか
  
  // ログ設定
  ENABLE_LOGGING: true,
  MAX_LOG_ENTRIES: 1000
};

// ===== フォルダ管理 =====
function getOrCreateFolder(folderName, parentFolder = null) {
  const parent = parentFolder || DriveApp.getRootFolder();
  const folders = parent.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parent.createFolder(folderName);
  }
}

function setupFolders() {
  return {
    backup: getOrCreateFolder(CONFIG.BACKUP_FOLDER_NAME),
    csv: getOrCreateFolder(CONFIG.CSV_FOLDER_NAME),
    preset: getOrCreateFolder(CONFIG.PRESET_FOLDER_NAME)
  };
}

// ===== ログ管理 =====
function addLog(action, data, status = "success", error = null) {
  if (!CONFIG.ENABLE_LOGGING) return;
  
  try {
    const logSheet = getOrCreateLogSheet();
    const timestamp = new Date();
    
    logSheet.appendRow([
      timestamp,
      action,
      JSON.stringify(data),
      status,
      error ? error.toString() : "",
      Session.getActiveUser().getEmail()
    ]);
    
    // 最大ログ数を超えた場合は古いものを削除
    const lastRow = logSheet.getLastRow();
    if (lastRow > CONFIG.MAX_LOG_ENTRIES + 1) {
      const deleteCount = lastRow - CONFIG.MAX_LOG_ENTRIES;
      logSheet.deleteRows(2, deleteCount);
    }
    
  } catch (e) {
    console.error("ログ追加エラー:", e);
  }
}

function getOrCreateLogSheet() {
  const ssName = "LoRA Prompt Maker - ログ";
  const files = DriveApp.getFilesByName(ssName);
  
  let spreadsheet;
  if (files.hasNext()) {
    spreadsheet = SpreadsheetApp.open(files.next());
  } else {
    spreadsheet = SpreadsheetApp.create(ssName);
  }
  
  let sheet = spreadsheet.getSheetByName("ログ");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("ログ");
    sheet.getRange(1, 1, 1, 6).setValues([[
      "タイムスタンプ", "アクション", "データ", "ステータス", "エラー", "ユーザー"
    ]]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

// ===== メイン処理 =====
function doPost(e) {
  try {
    // CORS対応
    const response = {
      status: "success",
      message: "",
      data: null,
      timestamp: new Date().toISOString()
    };
    
    // リクエストデータの解析
    let requestData;
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseError) {
      throw new Error("リクエストデータの解析に失敗: " + parseError.message);
    }
    
    // 認証チェック
    if (CONFIG.AUTH_TOKEN && requestData.token !== CONFIG.AUTH_TOKEN) {
      throw new Error("認証に失敗しました");
    }
    
    // アクションに基づく処理
    switch (requestData.action) {
      case "ping":
        response.message = "接続成功 - " + new Date().toLocaleString();
        addLog("ping", {}, "success");
        break;
        
      case "save_csv":
        response.data = await saveCSVData(requestData.data);
        response.message = "CSV保存完了";
        addLog("save_csv", { 
          type: requestData.data.type, 
          filename: requestData.data.filename 
        }, "success");
        break;
        
      case "save_preset":
        response.data = await savePresetData(requestData.data);
        response.message = "プリセット保存完了";
        addLog("save_preset", {
          mode: requestData.data.mode,
          name: requestData.data.name
        }, "success");
        break;
        
      case "save_backup":
        response.data = await saveBackupData(requestData.data);
        response.message = "バックアップ保存完了";
        addLog("save_backup", { 
          size: JSON.stringify(requestData.data).length 
        }, "success");
        break;
        
      case "get_data":
        response.data = await getData(requestData.data);
        response.message = "データ取得完了";
        addLog("get_data", { 
          getAction: requestData.data.getAction 
        }, "success");
        break;
        
      default:
        throw new Error("未知のアクション: " + requestData.action);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error("処理エラー:", error);
    
    addLog(requestData?.action || "unknown", requestData || {}, "error", error);
    
    const errorResponse = {
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET対応（テスト用）
function doGet(e) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>LoRA Prompt Maker - GAS Endpoint</title>
      <meta charset="utf-8">
    </head>
    <body>
      <h1>🎨 LoRA Prompt Maker - GAS Endpoint</h1>
      <p><strong>ステータス:</strong> ✅ 正常動作中</p>
      <p><strong>最終更新:</strong> ${new Date().toLocaleString()}</p>
      <hr>
      <h2>📊 統計情報</h2>
      <p>このエンドポイントは正常に動作しています。</p>
      <p>POST リクエストでデータを送信してください。</p>
      
      <h2>🔗 設定URL</h2>
      <p>以下のURLをクライアント側に設定してください：</p>
      <code>${ScriptApp.getService().getUrl()}</code>
      
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        code { background: #f5f5f5; padding: 8px; border-radius: 4px; }
      </style>
    </body>
    </html>
  `;
  
  return HtmlService
    .createHtmlOutput(html)
    .setTitle("AI Prompt Maker - GAS Endpoint");
}

// ===== データ保存機能 =====
async function saveCSVData(data) {
  const folders = setupFolders();
  const { type, filename, csv, metadata } = data;
  
  // CSVファイルとして保存
  const csvBlob = Utilities.newBlob(csv, "text/csv", filename);
  const csvFile = folders.csv.createFile(csvBlob);
  
  let spreadsheetUrl = null;
  
  // スプレッドシートとしても保存
  if (CONFIG.CREATE_SPREADSHEET) {
    try {
      const ssName = filename.replace('.csv', '') + " (スプレッドシート)";
      const spreadsheet = SpreadsheetApp.create(ssName);
      
      // CSVデータをパース
      const rows = csv.split('\n').map(row => {
        // 簡単なCSVパーサー（ダブルクォート対応）
        const cells = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          if (char === '"' && (i === 0 || row[i-1] === ',')) {
            inQuotes = true;
          } else if (char === '"' && inQuotes) {
            inQuotes = false;
          } else if (char === ',' && !inQuotes) {
            cells.push(current.replace(/^"|"$/g, ''));
            current = '';
          } else {
            current += char;
          }
        }
        cells.push(current.replace(/^"|"$/g, ''));
        return cells;
      });
      
      const sheet = spreadsheet.getActiveSheet();
      sheet.setName(type);
      
      if (rows.length > 0) {
        sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
        
        // ヘッダー行のフォーマット
        sheet.getRange(1, 1, 1, rows[0].length).setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
      
      // メタデータシートを追加
      const metaSheet = spreadsheet.insertSheet("メタデータ");
      const metaData = [
        ["項目", "値"],
        ["生成日時", new Date().toLocaleString()],
        ["タイプ", type],
        ["ファイル名", filename],
        ["行数", rows.length - 1],
        ["キャラクター名", metadata.characterName || "不明"],
        ["生成元", "LoRA Prompt Maker v2.1"]
      ];
      
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          if (!["characterName"].includes(key)) {
            metaData.push([key, String(value)]);
          }
        });
      }
      
      metaSheet.getRange(1, 1, metaData.length, 2).setValues(metaData);
      metaSheet.getRange(1, 1, 1, 2).setFontWeight("bold");
      metaSheet.setFrozenRows(1);
      
      // スプレッドシートをCSVフォルダに移動
      const ssFile = DriveApp.getFileById(spreadsheet.getId());
      folders.csv.addFile(ssFile);
      DriveApp.getRootFolder().removeFile(ssFile);
      
      spreadsheetUrl = spreadsheet.getUrl();
      
    } catch (ssError) {
      console.error("スプレッドシート作成エラー:", ssError);
    }
  }
  
  return {
    csvFileId: csvFile.getId(),
    csvUrl: csvFile.getUrl(),
    spreadsheetUrl,
    savedAt: new Date().toISOString(),
    size: csv.length
  };
}

async function savePresetData(data) {
  const folders = setupFolders();
  const { mode, name, preset, metadata } = data;
  
  const presetData = {
    mode,
    name,
    preset,
    metadata,
    savedAt: new Date().toISOString(),
    version: "2.1"
  };
  
  const filename = `preset_${mode}_${name}_${new Date().toISOString().split('T')[0]}.json`;
  const blob = Utilities.newBlob(JSON.stringify(presetData, null, 2), "application/json", filename);
  const file = folders.preset.createFile(blob);
  
  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    savedAt: new Date().toISOString()
  };
}

async function saveBackupData(data) {
  const folders = setupFolders();
  const { backup, metadata } = data;
  
  const backupData = {
    backup,
    metadata,
    savedAt: new Date().toISOString(),
    version: "2.1"
  };
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split('T')[0];
  const filename = `backup_${timestamp}.json`;
  const blob = Utilities.newBlob(JSON.stringify(backupData, null, 2), "application/json", filename);
  const file = folders.backup.createFile(blob);
  
  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    savedAt: new Date().toISOString(),
    size: JSON.stringify(backupData).length
  };
}

async function getData(data) {
  const folders = setupFolders();
  const { getAction, params } = data;
  
  switch (getAction) {
    case "list_backups":
      return listFiles(folders.backup, "backup");
      
    case "list_presets":
      return listFiles(folders.preset, "preset", params.mode);
      
    case "list_csvs":
      return listFiles(folders.csv, "csv", params.type);
      
    case "get_backup":
      return getFileContent(params.fileId);
      
    case "get_preset":
      return getFileContent(params.fileId);
      
    case "stats":
      return getStats(folders);
      
    default:
      throw new Error("未知のデータ取得アクション: " + getAction);
  }
}

function listFiles(folder, type, filter = null) {
  const files = folder.getFiles();
  const result = [];
  
  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    
    // フィルタリング
    if (filter) {
      if (type === "preset" && !name.includes(`preset_${filter}_`)) continue;
      if (type === "csv" && !name.includes(`${filter}_`)) continue;
    }
    
    result.push({
      id: file.getId(),
      name: name,
      url: file.getUrl(),
      size: file.getSize(),
      createdAt: file.getDateCreated().toISOString(),
      modifiedAt: file.getLastUpdated().toISOString()
    });
  }
  
  // 作成日時で降順ソート
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  return result;
}

function getFileContent(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    const content = file.getBlob().getDataAsString();
    
    return {
      id: fileId,
      name: file.getName(),
      content: content,
      size: file.getSize(),
      mimeType: file.getBlob().getContentType(),
      retrievedAt: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`ファイル取得エラー: ${error.message}`);
  }
}

function getStats(folders) {
  const stats = {
    backups: {
      count: 0,
      totalSize: 0,
      latestDate: null
    },
    presets: {
      count: 0,
      totalSize: 0,
      latestDate: null
    },
    csvs: {
      count: 0,
      totalSize: 0,
      latestDate: null
    }
  };
  
  function processFolder(folder, statKey) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      stats[statKey].count++;
      stats[statKey].totalSize += file.getSize();
      
      const modified = file.getLastUpdated();
      if (!stats[statKey].latestDate || modified > new Date(stats[statKey].latestDate)) {
        stats[statKey].latestDate = modified.toISOString();
      }
    }
  }
  
  processFolder(folders.backup, 'backups');
  processFolder(folders.preset, 'presets');
  processFolder(folders.csv, 'csvs');
  
  return stats;
}

// ===== 管理機能 =====
function cleanupOldFiles() {
  const folders = setupFolders();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90); // 90日前
  
  let deletedCount = 0;
  
  function cleanFolder(folder, folderName) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (file.getDateCreated() < cutoffDate) {
        console.log(`削除: ${folderName}/${file.getName()}`);
        file.setTrashed(true);
        deletedCount++;
      }
    }
  }
  
  cleanFolder(folders.backup, "backup");
  cleanFolder(folders.csv, "csv");
  // プリセットは削除しない
  
  console.log(`クリーンアップ完了: ${deletedCount}ファイル削除`);
  return deletedCount;
}

function createTriggers() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // 週次クリーンアップトリガー
  ScriptApp.newTrigger('cleanupOldFiles')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(2)
    .create();
    
  console.log("トリガーを設定しました");
}

// ===== セットアップ関数 =====
function setupGAS() {
  console.log("🚀 LoRA Prompt Maker GAS セットアップ開始");
  
  try {
    // フォルダ作成
    const folders = setupFolders();
    console.log("✅ フォルダ作成完了");
    
    // ログシート作成
    getOrCreateLogSheet();
    console.log("✅ ログシート作成完了");
    
    // トリガー設定
    createTriggers();
    console.log("✅ トリガー設定完了");
    
    // テストログ追加
    addLog("setup", { message: "GASセットアップ完了" }, "success");
    
    console.log("🎉 セットアップ完了!");
    console.log("WebアプリURL:", ScriptApp.getService().getUrl());
    
    return {
      status: "success",
      message: "セットアップ完了",
      webAppUrl: ScriptApp.getService().getUrl(),
      folders: {
        backup: folders.backup.getId(),
        csv: folders.csv.getId(),
        preset: folders.preset.getId()
      }
    };
    
  } catch (error) {
    console.error("❌ セットアップエラー:", error);
    throw error;
  }
}

// ===== テスト関数 =====
function testEndpoint() {
  const testData = {
    action: "ping",
    timestamp: new Date().toISOString(),
    token: CONFIG.AUTH_TOKEN
  };
  
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(mockEvent);
  console.log("テスト結果:", result.getContent());
  
  return JSON.parse(result.getContent());
}

// ===== 初期セットアップ実行 =====
// 初回のみ手動で実行してください
// setupGAS();
