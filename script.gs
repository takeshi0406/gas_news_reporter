/**
 * 処理を実行する。
 * @throw クローリングで1つ以上エラーが発生した場合
 */ 
function myFunction() {
  var parsers = createParsers();
  var errors = [];
  readConfig().forEach(function(config, i) {
    if (config['skip']) return;
    try {
      var latest_news = fetchLatestNews(config['title'],
         parsers[config['parser']], [config['feed']], config['charset'], i + 1);
      postNews(latest_news, config['title'], config['endpoint']);
    } catch (err) {
      errors.push(config["title"] + "のニュース通知で次のエラーが発生しました: " + new String(err));
    }
  });
  notifyErrors(errors);
}

/**
 * 設定を読み込んでパーサーを作る。
 * @return {Object} パーサーの型式名をキーにして、パーサー用の関数が取り出せるオブジェクト
 */
function createParsers() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('parser');
  var cells = sheet.getDataRange().getValues();
  // 1行目はヘッダーとして使いたいのでsliceで除去
  return cells.slice(1).reduce(function (result, row) {
    result[row[0]] = createFetchFunction(
      new RegExp(row[1], "i"),
      new RegExp(row[2], "gi"),
      new RegExp(row[3], "i"),
      new RegExp(row[4], "i")
    );
    return result;
  }, {});
}

/**
 * エラーを通知する。
 * @param {Array.<String>} クローラーのエラー
 * @throw エラーが存在する場合
 */
function notifyErrors(errors) {
  if (errors.length <= 0) return;
  var debug_endpoint = readCells('channel').reduce(function(result, row) {
    if (row[0] == "_debug") result = row[1];
    return result;
  });
  if (!debug_endpoint) throw "channelシートで_debugを設定してください";
  errors.forEach(function(message) {
    Logger.log(message);
    postSlack(message, debug_endpoint);
  });
  throw "クローラーでエラーが発生しました。ログを確認してください";
}

/**
 * SpreadSheetsから設定を読み込む。
 * @return {Array} パーサーの型式名をキーにして、パーサー用の関数が取り出せるオブジェクト
 */
function readConfig() {
  var channel = readCells('channel').reduce(function(result, cell) {
    result[cell[0]] = cell[1];
    return result;
  }, {});
  return readCells('config').map(function (row) {
    return {'title': row[0], 'feed': row[1], 'parser': row[2], 'endpoint': channel[row[3]], 'charset': row[4], 'skip': (row[5] !== "")};
  });
}

/**
 * SpreadSheetsシートの内容を多次元配列
 * @param {String} sheetname シート名
 * @return {Array.<Array.<String>>} シートの内容
 */
function readCells(sheetname) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetname);
  var cells = sheet.getDataRange().getValues();
  return cells.slice(1);
}


/**
 * ニュースを通知する
 * @param {Array} 通知すべきニュースの配列
 * @param {String} media ブログタイトルなど
 * @param {String} endpoint APIのURL
 */
function postNews(news_list, media, endpoint) {
  if (news_list.length === 0) return;
  if (news_list.length >= 10) throw "「" + media + "」の通知が長すぎます"; 
  news_list.forEach(function(news) {
    postSlack(media + ": " + news["title"] + "\n" + news["url"], endpoint);
  });
}

/**
 * Slackにポストする
 * @param {Array} 通知すべきニュースの配列
 * @param {String} media ブログタイトルなど
 * @param {String} endpoint APIのURL
 * @throw Slackへのpostが失敗した場合
 */
function postSlack(message, endpoint){
  var options = {
    "method" : "POST",
    "headers": {"Content-type": "application/json"},
    "payload" : JSON.stringify({"text": message, "unfurl_links": true})
  };
  UrlFetchApp.fetch(endpoint, options);
}

/**
 * 投稿したことないニュースだけを返し、スプレッドシートに最新のURLを残す。
 * @param {String} media ブログタイトルなど
 * @param {Array} news_list ページからパースした全てのニュースの配列
 * @param {number} cell_idx 保存先のセルの行数
 * @return {Array} 通知すべきニュースの配列
 */
function selectLatestNews(media, news_list, cell_idx) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('log');
  var url_cell = sheet.getRange('B' + cell_idx);
  var target_news = takeUntilLastNews(news_list, url_cell.getValues()[0][0]);
  if (target_news.length < 1) return [];
  url_cell.setValues([[target_news[0]['url']]]);
  sheet.getRange('A' + cell_idx).setValues([[media]]);
  return target_news;
}

/**
 * 既に投稿された最新のニュースが出るまでNewsを取得する。
 * @param {Array} news_list ページからパースした全てのニュースの配列
 * @param {String} latest_url 最新のニュースのURL
 * @return {Array} 通知すべきニュースの配列
 */
function takeUntilLastNews(news_list, latest_url) {
  var result = [];
  for (var i in news_list) {
    var news = news_list[i];
    if (news['url'] === latest_url) break;
    result.push(news);
  };
  return result;
}


/**
 * クロール結果のURLを修正する。
 * @param {Array} news_list ニュースの配列
 * @param {String} url ニュースの取得元のURL
 * @param {Array} URLを修正したニュースの配列
 */
function fillUrls(news_list, url) {
  return news_list.map(function(dict) {
    dict['url'] = createAbsUrl(url, dict['url']);
    return dict;
  });
}

/**
 * クロール結果のURLを修正する。
 * @param {String} url ニュースの取得元のURL
 * @param {?String} path_or_url ニュースのパスまたはnull
 */
function createAbsUrl(url, path_or_url) {
  if (!path_or_url) {
    return url;
  } else if (/^https?:\/\//.exec(path_or_url)) {
    return path_or_url;
  } else if (/^\//.exec(path_or_url)) {
    var base_url = url.replace(/^https?:\/\//, '').split('/')[0];
    var protocol = url.split(':')[0];
    return protocol + '://' + base_url + path_or_url;
  } else {
    // index.htmlなどを除く
    return url.replace(/\/([a-zA-Z0-9]+\.[a-z]+)?$/, '') + "/" + path_or_url;
  }
}

/**
 * ニュース取得を実行する関数を作る。
 * @param {RegExp} table_regexp 「ニュースのリストの範囲」を取得する正規表現
 * @param {RegExp} row_regexp 「ニュースの一行」を取得する正規表現
 * @param {RegExp} title_regexp 「ニュースタイトル」を取得する正規表現
 * @param {RegExp} url_regexp 「ニュースのURL」を取得する正規表現
 * @return {function(string, string): Array} ニュースをパースする関数
 */
function createFetchFunction(table_regexp, row_regexp, title_regexp, url_regexp) {
  return function(url, charset) {
    var html = fetchText(url, charset);
    var news_list = parseHtml(html, table_regexp, row_regexp, title_regexp, url_regexp);
    return fillUrls(news_list, url);
  };
}

/**
 * 正規表現で与えた要素を取り出す。
 * @param {String} html ニュース一覧ページのHTML
 * @param {RegExp} table_regexp 「ニュースのリストの範囲」を取得する正規表現
 * @param {RegExp} row_regexp 「ニュースの一行」を取得する正規表現
 * @param {RegExp} title_regexp 「ニュースタイトル」を取得する正規表現
 * @param {RegExp} url_regexp 「ニュースのURL」を取得する正規表現
 * @return {Array} ニュースの配列
 * @throw {String} パースに失敗した場合
 */
function parseHtml(html, table_regexp, row_regexp, title_regexp, url_regexp) {
  var table = parseMatchedElement(html, table_regexp);
  var rows = parseAllTags(table, row_regexp);
  return rows.map(function(row) {
    return {
      "title": parseToText(parseMatchedElement(row, title_regexp)),
      "url": parseMatchedElementIgnoreError(row, url_regexp),
    }
  });
}

/**
 * 正規表現にマッチする要素全てを取得する。
 * @param {String} html HTMLの文字列
 * @param {RegExp} regexp 正規表現
 * @return {Array.<String>} 文字列の配列
 * @throw {String} パースに失敗した場合
 */
function parseAllTags(html, regexp) {
  var match = html.match(regexp);
  if (!match) throw String(regexp) + 'にマッチする要素が見つかりませんでした';
  return match;
}

/**
 * 正規表現にマッチした要素を取得する。
 * @param {String} html HTMLの文字列
 * @param {RegExp} regexp 正規表現
 * @return {String} パース結果の文字列
 * @throw {String} パースに失敗した場合
 */
function parseMatchedElement(html, regexp) {
  var match = regexp.exec(html);
  if (!match) throw String(regexp) + 'にマッチする要素が見つかりませんでした';
  return match[1].replace(/^\s*(.*?)\s*$/, "$1"); // strip
}

/**
 * 正規表現にマッチした要素を取得する。失敗した場合はnullを返す。
 * @param {String} html HTMLの文字列
 * @param {RegExp} regexp 正規表現
 * @return {?String} パース結果の文字列
 */
function parseMatchedElementIgnoreError(html, regexp) {
  var match = regexp.exec(html);
  if (!match) return null;
  return match[1].replace(/^\s*(.*?)\s*$/, "$1"); // strip
}


/**
 * 文字列からhtmlタグや空白を取り除き、テキストのみを返す。
 * @param {String} html HTMLの文字列
 * @return {String} 文字列
 * @todo 場当たり的でない良い実装を見つける
 */
function parseToText(html) {
  html = html.replace(/[ |　]+/g,' ');
  html = html.replace(/\n+/g,'');
  html = html.replace('&#8217;', "'");
  return html.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g,'');
}

/**
 * URLからHTMLを取得する。
 * @param {String} url ニュース取得元のURL
 * @param {String} charset ページの文字コード
 * @throw {String} 取得に失敗した場合
 */
function fetchText(url, charset) {
  var err;
  for (var i = 0; i < 3; i++) {
    try {
      var response = UrlFetchApp.fetch(url);
      return response.getContentText(charset);
    } catch(e) {
      Utilities.sleep(5000);
      err = e;
    }
  }
  throw err;
}

/**
 * 最近のニュースを取得する。
 * @param {String} media ブログタイトルなど
 * @param {function(string, string): Array} fn ニュースをパースする関数
 * @param {Array.<String>} url 文字列のURLの配列
 * @param {String} charset ページの文字コード
 * @param {number} start_idx 保存先のセルの行数
 * @return {Array} ニュースの配列
 * @throw {String} HTMLの取得かパースに失敗した場合
 */
function fetchLatestNews(media, fn, urls, charset, start_index) {
  return urls.reduce(function(result, url, i) {
    var idx = start_index + i;
    var newarr = selectLatestNews(media, fn(url, charset), idx.toString());
    return result.concat(newarr);
  }, []);
}