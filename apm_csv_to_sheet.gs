/**
 * AI Prompt Maker - Google Apps Script側の受信コード（CORS完全対応版）
 */

// ===== 設定 =====
function getConfig() {
  var config = {
    AUTH_TOKEN: "", // 必要に応じて設定
    BACKUP_FOLDER_NAME: "AI_Prompt_Maker_Backups",
    CSV_FOLDER_NAME: "AI_Prompt_Maker_CSV", 
    PRESET_FOLDER_NAME: "AI_Prompt_Maker_Presets",
    CREATE_SPREADSHEET: true,
    ENABLE_LOGGING: true,
    MAX_LOG_ENTRIES: 1000
  };
  return config;
}

// ===== CORS対応のレスポンス関数 =====
function createCORSResponse(data, callback) {
  var jsonString = JSON.stringify(data);
  
  if (callback) {
    // JSONP形式
    return ContentService
      .createTextOutput(callback + '(' + jsonString + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    // 通常のJSON + CORSヘッダー
    return ContentService
      .createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== フォルダ管理（エラー修正版） =====
function getOrCreateFolder(folderName, parentFolder) {
  if (!folderName || typeof folderName !== 'string' || folderName.trim() === '') {
    throw new Error("無効なフォルダ名: " + folderName);
  }
  
  var parent = parentFolder || DriveApp.getRootFolder();
  var folders = parent.getFoldersByName(folderName.trim());
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parent.createFolder(folderName.trim());
  }
}

function setupFolders() {
  var config = getConfig();
  
  var folders = {
    backup: getOrCreateFolder(config.BACKUP_FOLDER_NAME),
    csv: getOrCreateFolder(config.CSV_FOLDER_NAME),
    preset: getOrCreateFolder(config.PRESET_FOLDER_NAME)
  };
  
  return folders;
}

// ===== ログ管理 =====
function addLog(action, data, status, error) {
  var config = getConfig();
  if (!config.ENABLE_LOGGING) return;
  
  try {
    var logSheet = getOrCreateLogSheet();
    var timestamp = new Date();
    
    logSheet.appendRow([
      timestamp,
      action,
      JSON.stringify(data),
      status || "success",
      error ? error.toString() : "",
      Session.getActiveUser().getEmail()
    ]);
    
    // 古いログを削除
    var lastRow = logSheet.getLastRow();
    if (lastRow > config.MAX_LOG_ENTRIES + 1) {
      var deleteCount = lastRow - config.MAX_LOG_ENTRIES;
      logSheet.deleteRows(2, deleteCount);
    }
    
  } catch (e) {
    console.error("ログ追加エラー:", e);
  }
}

function getOrCreateLogSheet() {
  var ssName = "AI Prompt Maker - ログ";
  var files = DriveApp.getFilesByName(ssName);
  
  var spreadsheet;
  if (files.hasNext()) {
    spreadsheet = SpreadsheetApp.open(files.next());
  } else {
    spreadsheet = SpreadsheetApp.create(ssName);
  }
  
  var sheet = spreadsheet.getSheetByName("ログ");
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

// ===== メイン処理（CORS完全対応） =====
function doGet(e) {
  try {
    var action = e.parameter.action || 'info';
    var callback = e.parameter.callback;
    
    if (action === 'ping') {
      var response = {
        status: "success",
        message: "GAS接続テスト成功 - " + new Date().toLocaleString('ja-JP'),
        timestamp: new Date().toISOString(),
        url: ScriptApp.getService().getUrl()
      };
      
      addLog("ping_get", { callback: !!callback }, "success");
      return createCORSResponse(response, callback);
    }
    
    // JSONPで複雑なデータを受信する場合
    if (e.parameter.data) {
      try {
        var requestData = JSON.parse(e.parameter.data);
        requestData.callback = callback;
        
        var result = processRequest(requestData);
        return createCORSResponse(result, callback);
        
      } catch (parseError) {
        var errorResponse = {
          status: "error",
          error: "データパース エラー: " + parseError.message,
          timestamp: new Date().toISOString()
        };
        return createCORSResponse(errorResponse, callback);
      }
    }
    
    // デフォルトの情報表示
    var html = `
    <html>
    <head>
      <title>AI Prompt Maker - GAS Endpoint</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .status { background: #e7f5e7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .url { background: #f5f5f5; padding: 10px; border-radius: 3px; font-family: monospace; }
        .test-button { background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 10px 0; }
      </style>
    </head>
    <body>
      <h1>🎨 AI Prompt Maker - GAS Endpoint</h1>
      
      <div class="status">
        <h2>✅ ステータス: 正常動作中</h2>
        <p><strong>最終確認:</strong> ${new Date().toLocaleString('ja-JP')}</p>
        <p><strong>URL:</strong></p>
        <div class="url">${ScriptApp.getService().getUrl()}</div>
      </div>
      
      <h2>🧪 接続テスト</h2>
      <button class="test-button" onclick="testConnection()">接続テスト実行</button>
      <div id="test-result"></div>
      
      <script>
        function testConnection() {
          var url = '${ScriptApp.getService().getUrl()}?action=ping&callback=handleTestResult';
          var script = document.createElement('script');
          script.src = url;
          document.head.appendChild(script);
        }
        
        function handleTestResult(response) {
          document.getElementById('test-result').innerHTML = 
            '<h3>テスト結果:</h3><pre>' + JSON.stringify(response, null, 2) + '</pre>';
        }
      </script>
    </body>
    </html>`;
    
    return HtmlService
      .createHtmlOutput(html)
      .setTitle("AI Prompt Maker - GAS Endpoint")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
  } catch (error) {
    var errorResponse = {
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    addLog("doGet_error", { error: error.message }, "error", error);
    return createCORSResponse(errorResponse, e.parameter.callback);
  }
}

function doPost(e) {
  try {
    var requestData;
    var callback = null;
    
    // POSTデータの解析
    if (e.postData && e.postData.contents) {
      try {
        requestData = JSON.parse(e.postData.contents);
      } catch (parseError) {
        // フォームデータとして再試行
        if (e.parameter) {
          if (e.parameter.action) {
            requestData = {
              action: e.parameter.action,
              data: e.parameter.data ? JSON.parse(e.parameter.data) : {},
              timestamp: e.parameter.timestamp,
              token: e.parameter.token
            };
            callback = e.parameter.callback;
          } else {
            throw new Error("POSTデータの解析に失敗: " + parseError.message);
          }
        } else {
          throw new Error("POSTデータが不正です");
        }
      }
    } else if (e.parameter && e.parameter.action) {
      // フォームデータとして処理
      requestData = {
        action: e.parameter.action,
        data: e.parameter.data ? JSON.parse(e.parameter.data) : {},
        timestamp: e.parameter.timestamp,
        token: e.parameter.token
      };
      callback = e.parameter.callback;
    } else {
      throw new Error("リクエストデータが見つかりません");
    }
    
    var result = processRequest(requestData);
    return createCORSResponse(result, callback);
    
  } catch (error) {
    var errorResponse = {
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
      details: error.stack
    };
    
    addLog("doPost_error", { error: error.message }, "error", error);
    return createCORSResponse(errorResponse, e.parameter ? e.parameter.callback : null);
  }
}

// ===== リクエスト処理（共通化） =====
function processRequest(requestData) {
  var config = getConfig();
  
  // 認証チェック（トークンが設定されている場合のみ）
  if (config.AUTH_TOKEN && requestData.token !== config.AUTH_TOKEN) {
    throw new Error("認証に失敗しました");
  }
  
  var response = {
    status: "success",
    message: "",
    data: null,
    timestamp: new Date().toISOString()
  };
  
  switch (requestData.action) {
    case "ping":
      response.message = "接続成功 - " + new Date().toLocaleString('ja-JP');
      response.data = {
        serverTime: new Date().toISOString(),
        gasUrl: ScriptApp.getService().getUrl()
      };
      addLog("ping", {}, "success");
      break;
      
    case "save_csv":
      response.data = saveCSVData(requestData.data);
      response.message = "CSV保存完了";
      addLog("save_csv", { 
        type: requestData.data.type, 
        filename: requestData.data.filename 
      }, "success");
      break;
      
    case "save_preset":
      response.data = savePresetData(requestData.data);
      response.message = "プリセット保存完了";
      addLog("save_preset", {
        mode: requestData.data.mode,
        name: requestData.data.name
      }, "success");
      break;
      
    case "save_backup":
      response.data = saveBackupData(requestData.data);
      response.message = "バックアップ保存完了";
      addLog("save_backup", { 
        size: JSON.stringify(requestData.data).length 
      }, "success");
      break;
      
    case "get_data":
      response.data = getData(requestData.data);
      response.message = "データ取得完了";
      addLog("get_data", { 
        getAction: requestData.data.getAction 
      }, "success");
      break;
      
    default:
      throw new Error("未知のアクション: " + requestData.action);
  }
  
  return response;
}

// ===== データ保存機能 =====
function saveCSVData(data) {
  if (!data || !data.csv || !data.filename) {
    throw new Error("CSVデータが不完全です");
  }
  
  var folders = setupFolders();
  var type = data.type || "unknown";
  var filename = data.filename;
  var csv = data.csv;
  var metadata = data.metadata || {};
  
  // CSVファイル保存
  var csvBlob = Utilities.newBlob(csv, "text/csv", filename);
  var csvFile = folders.csv.createFile(csvBlob);
  
  var result = {
    csvFileId: csvFile.getId(),
    csvUrl: csvFile.getUrl(),
    savedAt: new Date().toISOString(),
    size: csv.length,
    type: type
  };
  
  // スプレッドシート作成（オプション）
  var config = getConfig();
  if (config.CREATE_SPREADSHEET) {
    try {
      var ssName = filename.replace('.csv', '') + " (スプレッドシート)";
      var spreadsheet = SpreadsheetApp.create(ssName);
      
      // CSVを解析してスプレッドシートに挿入
      var rows = parseCSV(csv);
      
      if (rows.length > 0) {
        var sheet = spreadsheet.getActiveSheet();
        sheet.setName(type);
        
        var maxCols = Math.max.apply(Math, rows.map(function(row) { return row.length; }));
        sheet.getRange(1, 1, rows.length, maxCols).setValues(rows);
        
        // ヘッダー行のスタイリング
        if (rows.length > 0) {
          sheet.getRange(1, 1, 1, maxCols).setFontWeight("bold");
          sheet.setFrozenRows(1);
        }
      }
      
      // メタデータシート
      var metaSheet = spreadsheet.insertSheet("メタデータ");
      var metaData = [
        ["項目", "値"],
        ["生成日時", new Date().toLocaleString('ja-JP')],
        ["タイプ", type],
        ["ファイル名", filename],
        ["行数", rows.length - 1],
        ["キャラクター名", metadata.characterName || "不明"],
        ["生成元", "AI Prompt Maker v2.1"]
      ];
      
      for (var key in metadata) {
        if (key !== "characterName") {
          metaData.push([key, String(metadata[key])]);
        }
      }
      
      metaSheet.getRange(1, 1, metaData.length, 2).setValues(metaData);
      metaSheet.getRange(1, 1, 1, 2).setFontWeight("bold");
      metaSheet.setFrozenRows(1);
      
      // スプレッドシートを適切なフォルダに移動
      var ssFile = DriveApp.getFileById(spreadsheet.getId());
      folders.csv.addFile(ssFile);
      DriveApp.getRootFolder().removeFile(ssFile);
      
      result.spreadsheetUrl = spreadsheet.getUrl();
      result.spreadsheetId = spreadsheet.getId();
      
    } catch (ssError) {
      console.error("スプレッドシート作成エラー:", ssError);
      result.spreadsheetError = ssError.message;
    }
  }
  
  return result;
}

// CSV解析関数（改良版）
function parseCSV(csv) {
  var rows = [];
  var lines = csv.split('\n');
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === '') continue;
    
    var cells = [];
    var current = '';
    var inQuotes = false;
    
    for (var j = 0; j < line.length; j++) {
      var char = line[j];
      
      if (char === '"') {
        if (inQuotes && j + 1 < line.length && line[j + 1] === '"') {
          // エスケープされた引用符
          current += '"';
          j++; // 次の引用符をスキップ
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    cells.push(current);
    rows.push(cells);
  }
  
  return rows;
}

function savePresetData(data) {
  if (!data || !data.mode || !data.name || !data.preset) {
    throw new Error("プリセットデータが不完全です");
  }
  
  var folders = setupFolders();
  var presetData = {
    mode: data.mode,
    name: data.name,
    preset: data.preset,
    metadata: data.metadata || {},
    savedAt: new Date().toISOString(),
    version: "2.1"
  };
  
  var timestamp = new Date().toISOString().split('T')[0];
  var filename = "preset_" + data.mode + "_" + data.name + "_" + timestamp + ".json";
  var blob = Utilities.newBlob(JSON.stringify(presetData, null, 2), "application/json", filename);
  var file = folders.preset.createFile(blob);
  
  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    filename: filename,
    savedAt: new Date().toISOString()
  };
}

function saveBackupData(data) {
  if (!data || !data.backup) {
    throw new Error("バックアップデータが不完全です");
  }
  
  var folders = setupFolders();
  var backupData = {
    backup: data.backup,
    metadata: data.metadata || {},
    savedAt: new Date().toISOString(),
    version: "2.1"
  };
  
  var timestamp = new Date().toISOString().replace(/[:.]/g, "-").split('T')[0];
  var filename = "backup_" + timestamp + "_" + Utilities.getUuid().substring(0, 8) + ".json";
  var blob = Utilities.newBlob(JSON.stringify(backupData, null, 2), "application/json", filename);
  var file = folders.backup.createFile(blob);
  
  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    filename: filename,
    savedAt: new Date().toISOString(),
    size: JSON.stringify(backupData).length
  };
}

// ===== データ取得機能 =====
function getData(data) {
  var folders = setupFolders();
  var getAction = data.getAction;
  var params = data.params || {};
  
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

function listFiles(folder, type, filter) {
  var files = folder.getFiles();
  var result = [];
  
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    
    if (filter) {
      if (type === "preset" && name.indexOf("preset_" + filter + "_") === -1) continue;
      if (type === "csv" && name.indexOf(filter + "_") === -1) continue;
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
  
  result.sort(function(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  return result;
}

function getFileContent(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var content = file.getBlob().getDataAsString();
    
    return {
      id: fileId,
      name: file.getName(),
      content: content,
      size: file.getSize(),
      mimeType: file.getBlob().getContentType(),
      retrievedAt: new Date().toISOString()
    };
  } catch (error) {
    throw new Error("ファイル取得エラー: " + error.message);
  }
}

function getStats(folders) {
  var stats = {
    backups: { count: 0, totalSize: 0, latestDate: null },
    presets: { count: 0, totalSize: 0, latestDate: null },
    csvs: { count: 0, totalSize: 0, latestDate: null }
  };
  
  function processFolder(folder, statKey) {
    var files = folder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      stats[statKey].count++;
      stats[statKey].totalSize += file.getSize();
      
      var modified = file.getLastUpdated();
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

// ===== セットアップ・管理機能 =====
function setupGAS() {
  try {
    var folders = setupFolders();
    getOrCreateLogSheet();
    createTriggers();
    
    addLog("setup", { message: "GASセットアップ完了" }, "success");
    
    return {
      status: "success",
      message: "セットアップ完了",
      webAppUrl: ScriptApp.getService().getUrl(),
      folders: {
        backup: folders.backup.getId(),
        csv: folders.csv.getId(),
        preset: folders.preset.getId()
      },
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("セットアップエラー:", error);
    addLog("setup", { error: error.message }, "error", error);
    throw error;
  }
}

function createTriggers() {
  // 既存のトリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // 週次クリーンアップトリガー
  ScriptApp.newTrigger('cleanupOldFiles')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(2)
    .create();
}

function cleanupOldFiles() {
  var folders = setupFolders();
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90); // 90日前
  
  var deletedCount = 0;
  
  function cleanFolder(folder, folderName) {
    var files = folder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      if (file.getDateCreated() < cutoffDate) {
        console.log("削除: " + folderName + "/" + file.getName());
        file.setTrashed(true);
        deletedCount++;
      }
    }
  }
  
  cleanFolder(folders.backup, "backup");
  cleanFolder(folders.csv, "csv");
  
  addLog("cleanup", { deletedCount: deletedCount }, "success");
  return deletedCount;
}

// ===== テスト・デバッグ機能 =====
function testEndpoint() {
  var testData = {
    action: "ping",
    timestamp: new Date().toISOString(),
    token: getConfig().AUTH_TOKEN
  };
  
  var mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  var result = doPost(mockEvent);
  var response = JSON.parse(result.getContent());
  
  console.log("テスト結果:", response);
  return response;
}

function debugRequest(eventData) {
  console.log("=== デバッグ情報 ===");
  console.log("Event object:", JSON.stringify(eventData, null, 2));
  
  if (eventData.postData) {
    console.log("POST Data:", eventData.postData.contents);
  }
  
  if (eventData.parameter) {
    console.log("Parameters:", JSON.stringify(eventData.parameter, null, 2));
  }
  
  console.log("==================");
}
