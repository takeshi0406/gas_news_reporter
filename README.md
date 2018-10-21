# gas_news_reporter
Google Apps ScriptとGoogle SpreadSheetsで簡単にSlackニュース通知を作ることができます。

## Usage

SpreadSheetsにconfig, parser, channel, logの4つのシートを用意してください。

その後、config, parser, channelのシートを以下のように設定してください。

**config**

![config](https://raw.githubusercontent.com/takeshi0406/gas_news_reporter/master/images/config.png)


**parser**

![parser](https://raw.githubusercontent.com/takeshi0406/gas_news_reporter/master/images/parser.png)

**channel**

![channel](https://raw.githubusercontent.com/takeshi0406/gas_news_reporter/master/images/channel.png)

```script.gs```を実行すると、Slackに投稿され、最新のURLがlogシートに残されます。次回の実行時から、これ以前のURLが投稿されなくなります。


![log](https://raw.githubusercontent.com/takeshi0406/gas_news_reporter/master/images/log.png)


## TODO::

ドキュメントをマシにする。
