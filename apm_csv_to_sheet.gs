function doGet(e) {
  console.log("doGet実行");
  
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action || "none";
  const callback = params.callback;
  
  if (action === "ping") {
    const result = {
    status: "success",
    message: "接続成功",
    timestamp: new Date().toISOString(),
    data: {
      serverTime: new Date().toISOString()
    }
    };
    
    const responseJson = JSON.stringify(result);
    
    if (callback) {
      return ContentService
        .createTextOutput(callback + "(" + responseJson + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
  }
  
  return ContentService
    .createTextOutput("GET OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    console.log("=== doPost開始 ===");
    console.log("受信パラメータ確認:");
    console.log("e存在:", !!e);
    
    if (!e) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: "error",
          message: "パラメータが受信されませんでした"
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    console.log("eのプロパティ:", Object.keys(e));
    
    let requestData = null;
    
    // FormData形式での送信を処理
    if (e.postData && e.postData.contents) {
      console.log("postData.contentsから取得");
      console.log("データ形式確認:", e.postData.contents.substring(0, 100));
      
      // FormDataとしてパース
      requestData = parseFormData(e.postData.contents);
      console.log("FormDataパース完了");
    }
    // parameterから取得（バックアップ）
    else if (e.parameter) {
      console.log("parameterから取得");
      requestData = e.parameter;
    }
    
    console.log("取得データタイプ:", typeof requestData);
    console.log("データ存在:", !!requestData);
    
    if (!requestData) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: "error",
          message: "データが受信されませんでした",
          debug: {
            hasPostData: !!(e.postData),
            hasParameter: !!(e.parameter),
            contentType: e.postData ? e.postData.type : "unknown"
          }
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // アクション判定
    const action = requestData.action || "unknown";
    console.log("アクション:", action);
    
    if (action === "save_csv") {
      console.log("CSV保存処理開始");
      console.log("受信データキー:", Object.keys(requestData));
      
      // dataパラメータからJSONを抽出
      let actualData = requestData;
      if (requestData.data) {
        try {
          console.log("dataパラメータをJSONパース");
          actualData = JSON.parse(requestData.data);
          console.log("JSONパース成功");
        } catch (e) {
          console.log("JSONパース失敗:", e.message);
        }
      }
      
      console.log("最終データキー:", Object.keys(actualData));
      console.log("CSVデータ存在:", !!actualData.csv);
      console.log("ファイル名存在:", !!actualData.filename);
      
      // 必要なデータが存在するかチェック
      if (!actualData.csv || !actualData.filename) {
        return ContentService
          .createTextOutput(JSON.stringify({
            status: "error",
            message: "CSVデータまたはファイル名が不足しています",
            received: {
              hasCSV: !!actualData.csv,
              hasFilename: !!actualData.filename,
              csvLength: actualData.csv ? actualData.csv.length : 0,
              dataKeys: Object.keys(actualData)
            }
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      const saveResult = saveToSpreadsheet(actualData);
      
      return ContentService
        .createTextOutput(JSON.stringify({
          status: "success",
          data: saveResult,
          message: "スプレッドシート保存完了"
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // デフォルト応答
    return ContentService
      .createTextOutput(JSON.stringify({
        status: "success",
        message: "POST受信成功",
        action: action,
        dataReceived: true,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error("doPostエラー:", error);
    console.error("エラースタック:", error.stack);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// FormData形式の文字列をオブジェクトに変換
function parseFormData(formDataString) {
  const params = {};
  const pairs = formDataString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      // URLデコード
      const decodedKey = decodeURIComponent(key);
      const decodedValue = decodeURIComponent(value.replace(/\+/g, ' '));
      params[decodedKey] = decodedValue;
    }
  }
  
  return params;
}


function parseQueryString(queryString) {
  const params = {};
  const pairs = queryString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  
  return params;
}

function saveToSpreadsheet(data) {
  console.log("スプレッドシート保存開始");
  
  // データ検証
  if (!data.csv || !data.filename) {
    throw new Error("CSVデータまたはファイル名が不足しています");
  }
  
  const csv = data.csv;
  const filename = data.filename;
  const type = data.type || "unknown";
  const metadata = data.metadata || {};
  
  console.log("ファイル名:", filename);
  console.log("タイプ:", type);
  console.log("CSV長さ:", csv.length + "文字");
  
  // CSVをパース
  const rows = parseCSVToArray(csv);
  console.log("パース結果:", rows.length + "行");
  
  if (rows.length <= 1) {
    throw new Error("CSVデータにヘッダーのみが含まれています");
  }
  
  // データの順序を修正（#列でソート）
  const sortedRows = sortByNumberColumn(rows);
  console.log("ソート完了:", sortedRows.length + "行");
  
  // フォルダ作成・取得
  const rootFolderName = "AI_Prompt_Maker_Data";
  let rootFolder;
  
  const folders = DriveApp.getFoldersByName(rootFolderName);
  if (folders.hasNext()) {
    rootFolder = folders.next();
  } else {
    rootFolder = DriveApp.createFolder(rootFolderName);
  }
  
  let csvFolder;
  const csvFolders = rootFolder.getFoldersByName("Spreadsheets");
  if (csvFolders.hasNext()) {
    csvFolder = csvFolders.next();
  } else {
    csvFolder = rootFolder.createFolder("Spreadsheets");
  }
  
  // スプレッドシート作成
  const ssName = filename.replace('.csv', '') + '_データ_' + Utilities.formatDate(new Date(), 'JST', 'MMdd_HHmm');
  const spreadsheet = SpreadsheetApp.create(ssName);
  
  // データシート作成
  const dataSheet = spreadsheet.getActiveSheet();
  dataSheet.setName(type + "_データ");
  
  // データ正規化
  const normalizedRows = normalizeSpreadsheetData(sortedRows);
  const maxCols = normalizedRows[0].length;
  
  console.log("正規化後のデータ:");
  console.log("- 行数:", normalizedRows.length);
  console.log("- 列数:", maxCols);
  
  // データ書き込み
  if (normalizedRows.length > 1000) {
    // 分割書き込み
    const chunkSize = 1000;
    for (let i = 0; i < normalizedRows.length; i += chunkSize) {
      const chunk = normalizedRows.slice(i, i + chunkSize);
      dataSheet.getRange(i + 1, 1, chunk.length, maxCols).setValues(chunk);
      console.log(`書き込み進捗: ${i + chunk.length}/${normalizedRows.length}行`);
      Utilities.sleep(100);
    }
  } else {
    dataSheet.getRange(1, 1, normalizedRows.length, maxCols).setValues(normalizedRows);
    console.log("一括書き込み完了");
  }
  
  // ヘッダー行のフォーマット
  if (normalizedRows.length > 0) {
    dataSheet.getRange(1, 1, 1, maxCols).setFontWeight("bold");
    dataSheet.getRange(1, 1, 1, maxCols).setBackground("#f0f0f0");
    dataSheet.setFrozenRows(1);
  }
  
  // 列幅自動調整（最初の10列のみ）
  for (let i = 1; i <= Math.min(maxCols, 10); i++) {
    dataSheet.autoResizeColumn(i);
  }
  
  // メタデータシート作成
  const metaSheet = spreadsheet.insertSheet("メタデータ");
  const metaData = [
    ["項目", "値"],
    ["作成日時", new Date().toLocaleString('ja-JP')],
    ["データタイプ", type],
    ["元ファイル名", filename],
    ["データ行数", normalizedRows.length - 1],
    ["総行数", normalizedRows.length],
    ["列数", maxCols],
    ["キャラクター名", metadata.characterName || "不明"],
    ["生成元", "AI Prompt Maker"],
    ["データサイズ", csv.length + " 文字"],
    ["処理完了日時", new Date().toISOString()],
    ["ソート", "連番順に整列済み"]
  ];
  
  metaSheet.getRange(1, 1, metaData.length, 2).setValues(metaData);
  metaSheet.getRange(1, 1, 1, 2).setFontWeight("bold");
  metaSheet.getRange(1, 1, 1, 2).setBackground("#e3f2fd");
  metaSheet.setFrozenRows(1);
  metaSheet.autoResizeColumn(1);
  metaSheet.autoResizeColumn(2);
  
  // スプレッドシートをフォルダに移動
  const ssFile = DriveApp.getFileById(spreadsheet.getId());
  csvFolder.addFile(ssFile);
  DriveApp.getRootFolder().removeFile(ssFile);
  
  const result = {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    filename: ssName,
    dataRows: normalizedRows.length - 1,
    totalRows: normalizedRows.length,
    columns: maxCols,
    type: type,
    savedAt: new Date().toISOString(),
    folderId: csvFolder.getId(),
    sorted: true
  };
  
  console.log("スプレッドシート保存完了:", result.filename);
  return result;
}

function parseCSVToArray(csv) {
  console.log("CSV解析開始（連番データのみ抽出）");
  
  const lines = csv.split('\n').map(line => line.trim()).filter(line => line !== '');
  console.log("総行数:", lines.length);
  
  const validRows = [];
  
  // ヘッダーを手動作成
  const header = ['no', 'seed', 'prompt', 'negative'];
  validRows.push(header);
  console.log("ヘッダー作成:", header);
  
  console.log("=== 行の詳細チェック（修正版） ===");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // デバッグ出力（最初の15行のみ）
    if (i < 15) {
      console.log(`行${i}: "${line.substring(0, 100)}"`);
      
      // ダブルクォート除去後の数字チェック
      const cleanLine = line.replace(/^"/, '').trim();
      const startsWithNumber = /^\d+/.test(cleanLine);
      console.log(`  クリーンライン: "${cleanLine.substring(0, 30)}"`);
      console.log(`  数字開始チェック: ${startsWithNumber}`);
      console.log(`  カンマ含有: ${line.includes(',')}`);
    }
    
    // 修正された条件：ダブルクォートで囲まれた数字行を検出
    let isDataRow = false;
    
    // パターン1: "数字" で始まる行
    if (/^"\d+",/.test(line)) {
      isDataRow = true;
    }
    // パターン2: 数字で始まる行（クォートなし）
    else if (/^\d+,/.test(line)) {
      isDataRow = true;
    }
    
    if (isDataRow) {
      console.log(`マッチした行${i}: "${line.substring(0, 80)}"`);
      
      const cells = parseCSVLine(line);
      console.log(`  パース結果: [${cells.length}列]`, cells.map((cell, idx) => 
        `${idx}: ${cell ? cell.substring(0, 20) + (cell.length > 20 ? '...' : '') : '(空)'}`
      ));
      
      // データ検証：連番、シード、プロンプトが存在するか
      if (cells.length >= 3 && 
          cells[0] && /^\d+$/.test(cells[0].trim()) && // 連番が数字
          cells[1] && /^\d+$/.test(cells[1].trim()) && // シードが数字
          cells[2] && cells[2].trim().length > 5) {    // プロンプトが5文字以上
        
        // 4列に正規化
        while (cells.length < 4) {
          cells.push('');
        }
        
        validRows.push(cells.slice(0, 4));
        console.log(`  → 追加: データ行${validRows.length - 1}`);
        
      } else {
        console.log(`  → スキップ: データ検証失敗`);
        console.log(`    連番チェック: ${cells[0]} -> ${cells[0] && /^\d+$/.test(cells[0].trim())}`);
        console.log(`    シードチェック: ${cells[1]} -> ${cells[1] && /^\d+$/.test(cells[1].trim())}`);
        console.log(`    プロンプト長: ${cells[2] ? cells[2].length : 0}`);
      }
    }
  }
  
  console.log("抽出完了:", (validRows.length - 1) + "データ行");
  
  // 連番順にソート
  if (validRows.length > 1) {
    const headerRow = validRows[0];
    const dataRows = validRows.slice(1);
    
    dataRows.sort((a, b) => {
      const aNum = parseInt(a[0]) || 0;
      const bNum = parseInt(b[0]) || 0;
      return aNum - bNum;
    });
    
    console.log("ソート完了");
    console.log("最初の3行の連番:", dataRows.slice(0, 3).map(row => row[0]));
    
    return [headerRow, ...dataRows];
  }
  
  return validRows;
}

function parseCSVLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // エスケープされたクォート
        current += '"';
        i += 2;
      } else {
        // クォート開始/終了
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // カンマ区切り
      cells.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // 最後のセルを追加
  cells.push(current.trim());
  
  return cells;
}

function isValidDataRow(cells, originalLine) {
  // 空行や不完全な行をスキップ
  if (cells.length < 3) return false;
  
  // 最初のセルが数字でない場合はスキップ（連番以外）
  const firstCell = cells[0]?.trim();
  if (!firstCell || isNaN(parseInt(firstCell))) return false;
  
  // "Seed:" で始まる行はスキップ
  if (originalLine.toLowerCase().includes('seed:')) return false;
  
  // "Negative prompt:" で始まる行はスキップ
  if (originalLine.toLowerCase().includes('negative prompt:')) return false;
  
  // 2列目（seed列）が数字でない場合はスキップ
  const secondCell = cells[1]?.trim();
  if (!secondCell || isNaN(parseInt(secondCell))) return false;
  
  // 3列目（prompt列）が存在し、内容がある場合のみ有効
  const thirdCell = cells[2]?.trim();
  if (!thirdCell || thirdCell.length < 5) return false;
  
  return true;
}

function parseCSVLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  cells.push(current.trim());
  return cells;
}

// ソート関数も修正
function sortByNumberColumn(rows) {
  if (rows.length <= 1) return rows;
  
  const header = rows[0];
  const dataRows = rows.slice(1);
  
  console.log("ソート対象データ行数:", dataRows.length);
  
  // 連番列でソート（1列目）
  dataRows.sort((a, b) => {
    const aNum = parseInt(a[0]) || 0;
    const bNum = parseInt(b[0]) || 0;
    return aNum - bNum;
  });
  
  console.log("ソート完了");
  console.log("最初の5行の連番:", dataRows.slice(0, 5).map(row => row[0]));
  
  return [header, ...dataRows];
}


// スプレッドシート保存時のデータ整理関数
function normalizeSpreadsheetData(rows) {
  if (rows.length === 0) return rows;
  
  const maxCols = Math.max(...rows.map(row => row.length));
  console.log("最大列数:", maxCols);
  
  const normalizedRows = rows.map((row, index) => {
    const normalizedRow = [...row];
    
    while (normalizedRow.length < maxCols) {
      normalizedRow.push('');
    }
    
    if (normalizedRow.length > maxCols) {
      normalizedRow.splice(maxCols);
    }
    
    return normalizedRow;
  });
  
  console.log("データ正規化完了");
  return normalizedRows;
}
