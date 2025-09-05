/**
 * AI Prompt Maker - Google Apps Script側の受信コード（完全修正版）
 */

// ===== 設定 =====
function getConfig() {
  console.log("🔍 getConfig() 呼び出し");
  var config = {
    AUTH_TOKEN: "",
    BACKUP_FOLDER_NAME: "AI_Prompt_Maker_Backups",
    CSV_FOLDER_NAME: "AI_Prompt_Maker_CSV",
    PRESET_FOLDER_NAME: "AI_Prompt_Maker_Presets",
    CREATE_SPREADSHEET: true,
    ENABLE_LOGGING: true,
    MAX_LOG_ENTRIES: 1000
  };
  console.log("📋 設定値:", JSON.stringify(config));
  return config;
}

// ===== フォルダ管理 =====
function getOrCreateFolder(folderName, parentFolder) {
  console.log("📁 getOrCreateFolder開始");
  console.log("📍 呼び出し元スタックトレース:");
  try {
    throw new Error("スタックトレース取得用");
  } catch (e) {
    console.log(e.stack);
  }
  
  console.log("  引数1 folderName:", folderName);
  console.log("  引数1の型:", typeof folderName);
  console.log("  引数1のJSON:", JSON.stringify(folderName));
  console.log("  引数2 parentFolder:", parentFolder);
  
  if (!folderName || folderName === '' || folderName === null || folderName === undefined) {
    console.error("❌ フォルダ名が無効:", folderName);
    throw new Error("フォルダ名が無効: " + folderName);
  }
  
  var parent = parentFolder || DriveApp.getRootFolder();
  var folders = parent.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    console.log("✅ 既存フォルダ発見:", folderName);
    return folders.next();
  } else {
    console.log("📁 新規フォルダ作成:", folderName);
    return parent.createFolder(folderName);
  }
}

function setupFolders() {
  console.log("📁 setupFolders開始");
  
  var config = getConfig();
  console.log("🔍 configの中身確認:");
  console.log("  config:", config);
  console.log("  config.BACKUP_FOLDER_NAME:", config.BACKUP_FOLDER_NAME);
  console.log("  config.CSV_FOLDER_NAME:", config.CSV_FOLDER_NAME);
  console.log("  config.PRESET_FOLDER_NAME:", config.PRESET_FOLDER_NAME);
  
  // ここで個別に値を取り出して確認
  var backupName = config.BACKUP_FOLDER_NAME;
  var csvName = config.CSV_FOLDER_NAME;
  var presetName = config.PRESET_FOLDER_NAME;
  
  console.log("🔍 個別値確認:");
  console.log("  backupName:", backupName, "型:", typeof backupName);
  console.log("  csvName:", csvName, "型:", typeof csvName);
  console.log("  presetName:", presetName, "型:", typeof presetName);
  
  console.log("📁 フォルダ作成開始 - backup");
  var backupFolder = getOrCreateFolder(backupName);
  
  console.log("📁 フォルダ作成開始 - csv");
  var csvFolder = getOrCreateFolder(csvName);
  
  console.log("📁 フォルダ作成開始 - preset");
  var presetFolder = getOrCreateFolder(presetName);
  
  var folders = {
    backup: backupFolder,
    csv: csvFolder,
    preset: presetFolder
  };
  
  console.log("✅ 全フォルダ作成完了");
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

// ===== メイン処理 =====
function doPost(e) {
  try {
    var response = {
      status: "success",
      message: "",
      data: null,
      timestamp: new Date().toISOString()
    };
    
    var requestData;
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseError) {
      throw new Error("リクエストデータの解析に失敗: " + parseError.message);
    }
    
    var config = getConfig();
    if (config.AUTH_TOKEN && requestData.token !== config.AUTH_TOKEN) {
      throw new Error("認証に失敗しました");
    }
    
    switch (requestData.action) {
      case "ping":
        response.message = "接続成功 - " + new Date().toLocaleString();
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
    
    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error("処理エラー:", error);
    
    addLog(requestData ? requestData.action : "unknown", requestData || {}, "error", error);
    
    var errorResponse = {
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var html = "<html><body>" +
    "<h1>🎨 AI Prompt Maker - GAS Endpoint</h1>" +
    "<p><strong>ステータス:</strong> ✅ 正常動作中</p>" +
    "<p><strong>最終更新:</strong> " + new Date().toLocaleString() + "</p>" +
    "<hr><h2>🔗 設定URL</h2>" +
    "<p>以下のURLをクライアント側に設定してください：</p>" +
    "<code>" + ScriptApp.getService().getUrl() + "</code>" +
    "</body></html>";
  
  return HtmlService.createHtmlOutput(html).setTitle("AI Prompt Maker - GAS Endpoint");
}

// ===== データ保存機能 =====
function saveCSVData(data) {
  var folders = setupFolders();
  var type = data.type;
  var filename = data.filename;
  var csv = data.csv;
  var metadata = data.metadata;
  
  var csvBlob = Utilities.newBlob(csv, "text/csv", filename);
  var csvFile = folders.csv.createFile(csvBlob);
  
  var spreadsheetUrl = null;
  var config = getConfig();
  
  if (config.CREATE_SPREADSHEET) {
    try {
      var ssName = filename.replace('.csv', '') + " (スプレッドシート)";
      var spreadsheet = SpreadsheetApp.create(ssName);
      
      var rows = csv.split('\n').map(function(row) {
        var cells = [];
        var current = '';
        var inQuotes = false;
        
        for (var i = 0; i < row.length; i++) {
          var char = row[i];
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
      
      var sheet = spreadsheet.getActiveSheet();
      sheet.setName(type);
      
      if (rows.length > 0) {
        sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
        sheet.getRange(1, 1, 1, rows[0].length).setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
      
      var metaSheet = spreadsheet.insertSheet("メタデータ");
      var metaData = [
        ["項目", "値"],
        ["生成日時", new Date().toLocaleString()],
        ["タイプ", type],
        ["ファイル名", filename],
        ["行数", rows.length - 1],
        ["キャラクター名", metadata.characterName || "不明"],
        ["生成元", "AI Prompt Maker v2.1"]
      ];
      
      if (metadata) {
        for (var key in metadata) {
          if (key !== "characterName") {
            metaData.push([key, String(metadata[key])]);
          }
        }
      }
      
      metaSheet.getRange(1, 1, metaData.length, 2).setValues(metaData);
      metaSheet.getRange(1, 1, 1, 2).setFontWeight("bold");
      metaSheet.setFrozenRows(1);
      
      var ssFile = DriveApp.getFileById(spreadsheet.getId());
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
    spreadsheetUrl: spreadsheetUrl,
    savedAt: new Date().toISOString(),
    size: csv.length
  };
}

function savePresetData(data) {
  var folders = setupFolders();
  var mode = data.mode;
  var name = data.name;
  var preset = data.preset;
  var metadata = data.metadata;
  
  var presetData = {
    mode: mode,
    name: name,
    preset: preset,
    metadata: metadata,
    savedAt: new Date().toISOString(),
    version: "2.1"
  };
  
  var filename = "preset_" + mode + "_" + name + "_" + new Date().toISOString().split('T')[0] + ".json";
  var blob = Utilities.newBlob(JSON.stringify(presetData, null, 2), "application/json", filename);
  var file = folders.preset.createFile(blob);
  
  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    savedAt: new Date().toISOString()
  };
}

function saveBackupData(data) {
  var folders = setupFolders();
  var backup = data.backup;
  var metadata = data.metadata;
  
  var backupData = {
    backup: backup,
    metadata: metadata,
    savedAt: new Date().toISOString(),
    version: "2.1"
  };
  
  var timestamp = new Date().toISOString().replace(/[:.]/g, "-").split('T')[0];
  var filename = "backup_" + timestamp + ".json";
  var blob = Utilities.newBlob(JSON.stringify(backupData, null, 2), "application/json", filename);
  var file = folders.backup.createFile(blob);
  
  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    savedAt: new Date().toISOString(),
    size: JSON.stringify(backupData).length
  };
}

function getData(data) {
  var folders = setupFolders();
  var getAction = data.getAction;
  var params = data.params;
  
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

// ===== セットアップ関数 =====
function setupGAS() {
  console.log("🚀 AI Prompt Maker GAS セットアップ開始");
  console.log("📍 setupGAS() 関数の開始地点");
  
  try {
    console.log("📍 Step 1: setupFolders() を呼び出します");
    var folders = setupFolders();
    console.log("✅ フォルダ作成完了");
    
    console.log("📍 Step 2: getOrCreateLogSheet() を呼び出します");
    getOrCreateLogSheet();
    console.log("✅ ログシート作成完了");
    
    console.log("📍 Step 3: createTriggers() を呼び出します");
    createTriggers();
    console.log("✅ トリガー設定完了");
    
    console.log("📍 Step 4: addLog() を呼び出します");
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
    console.error("❌ セットアップエラー詳細:");
    console.error("  エラーメッセージ:", error.message);
    console.error("  エラースタック:", error.stack);
    throw error;
  }
}

// ===== 管理機能 =====
function cleanupOldFiles() {
  console.log("🧹 cleanupOldFiles() 開始");
  var folders = setupFolders();
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  
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
  
  console.log("クリーンアップ完了: " + deletedCount + "ファイル削除");
  return deletedCount;
}

function createTriggers() {
  console.log("🕒 createTriggers() 開始");
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  ScriptApp.newTrigger('cleanupOldFiles')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(2)
    .create();
    
  console.log("トリガーを設定しました");
}

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
  console.log("テスト結果:", result.getContent());
  
  return JSON.parse(result.getContent());
}
