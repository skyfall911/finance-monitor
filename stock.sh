#!/bin/bash
# 财经监控快捷命令

cd /Users/ray/.openclaw/workspace-cia/skills/finance-monitor

# 读取 .env 配置
if [ -f .env ]; then
  source <(grep -v '^#' .env | grep -v '^$')
fi

# 默认值
FEISHU_APP_ID=${FEISHU_APP_ID:-cli_a94a2d3dc138dcb6}
FEISHU_APP_SECRET=${FEISHU_APP_SECRET:-8RIFqPncuNgloLqNWcOqlcDCcQrM0F2h}
FEISHU_USER_OPEN_ID=${FEISHU_USER_OPEN_ID:-ou_ad70c7a42c69dec8464bb84eb114b0df}
FEISHU_CHAT_ID=${FEISHU_CHAT_ID:-oc_04c5349b1fe02f96c7e144a2999e8309}

case "$1" in
  status)
    node -e "
const { FeishuClient } = require('./dist/feishu');
const { StockPoolManager } = require('./dist/stockPool');
const { NewsCrawler } = require('./dist/news');
const feishu = new FeishuClient({ appId: '${FEISHU_APP_ID}', appSecret: '${FEISHU_APP_SECRET}' });
const stockPool = new StockPoolManager('./data', 200);
const newsCrawler = new NewsCrawler(30);

async function send() {
  const pool = stockPool.getPoolData();
  const stocks = stockPool.getTopStocks(200);
  const news = await newsCrawler.fetchDailyNews();

  const industryKeywords = {
    '新能源': ['新能源', '光伏', '风电', '锂电池', '储能', '电动车', '碳中和'],
    '半导体': ['半导体', '芯片', '集成电路', '晶圆', '光刻机', '封测'],
    '医药': ['医药', '生物医药', '疫苗', '医疗器械', '中药', '创新药'],
    '消费': ['白酒', '食品', '家电', '零售', '旅游', '酒店'],
    '金融': ['银行', '保险', '券商', '证券', '基金', '期货'],
    '科技': ['人工智能', '5G', '云计算', '大数据', 'AI', '机器人'],
    '房地产': ['房地产', '地产', '建筑', '物业', '建材'],
    '军工': ['军工', '国防', '航天', '航空', '船舶', '卫星'],
    '周期': ['钢铁', '煤炭', '有色', '化工', '水泥', '石油', '稀土']
  };

  function findRelatedNews(industry) {
    const keywords = industryKeywords[industry] || [];
    const related = [];
    for (const n of news) {
      const text = n.title + n.content;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          related.push(n.title);
          break;
        }
      }
      if (related.length >= 2) break;
    }
    return related;
  }

  const STOCK_DIVIDER = '━━━━━━━━━━━━━━━━━━━';
  const INNER_DIVIDER = '‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑';

  let msg = '📊 股票池\n';
  msg += STOCK_DIVIDER + '\n';
  msg += '总数: ' + pool.totalCount + '/200\n';
  msg += '评估: ' + (pool.lastEvaluationDate || '暂无') + '\n\n';

  for (let i = 0; i < stocks.length; i++) {
    const s = stocks[i];
    const relatedNews = findRelatedNews(s.industry);

    msg += STOCK_DIVIDER + '\n';
    msg += (i+1) + '. ' + s.name + ' ' + s.code + '\n';
    msg += '行业: ' + s.industry + ' | 市值: ' + s.marketCap.toFixed(0) + '亿\n';
    msg += '板块: ' + s.board + '\n';
    msg += INNER_DIVIDER + '\n';
    msg += '📈 评分: ' + s.totalScore + '/100\n';
    msg += '　投资潜力: ' + s.scores.investmentPotential + ' | 市场热度: ' + s.scores.marketHotness + '\n';
    msg += '　消息面: ' + s.scores.newsSentiment + ' | 财务状况: ' + s.scores.financialHealth + '\n';
    msg += '　诉讼风险: ' + s.scores.litigationRisk + ' | 近期表现: ' + s.scores.recentPerformance + '\n';

    if (relatedNews.length > 0) {
      msg += INNER_DIVIDER + '\n';
      msg += '📰 关联热点:\n';
      relatedNews.forEach(n => { msg += '　• ' + n + '\n'; });
    }

    msg += INNER_DIVIDER + '\n';
    msg += '✅ 入池: ' + s.advantages + '\n';
    msg += '⚠️ 风险: ' + s.risks + '\n';
    msg += '\n';
  }

  msg += STOCK_DIVIDER + '\n';
  msg += '数据更新时间: ' + new Date().toLocaleString('zh-CN');

  await feishu.sendUserMessage('${FEISHU_USER_OPEN_ID}', msg);
  console.log('已发送到飞书');
}

send().catch(e => console.error(e.message));
"
    ;;
  news)
    node -e "
const { FeishuClient } = require('./dist/feishu');
const { NewsCrawler } = require('./dist/news');
const feishu = new FeishuClient({ appId: '${FEISHU_APP_ID}', appSecret: '${FEISHU_APP_SECRET}' });
const newsCrawler = new NewsCrawler(10);
newsCrawler.fetchDailyNews().then(news => {
  let msg = '📈 财经新闻\n\n';
  news.slice(0, 10).forEach((n, i) => { msg += (i+1) + '. ' + n.title + '\n   ' + n.content.substring(0, 40) + '...\n\n'; });
  feishu.sendUserMessage('${FEISHU_USER_OPEN_ID}', msg).then(() => console.log('已发送到飞书'));
});
"
    ;;
  top)
    node -e "
const { FeishuClient } = require('./dist/feishu');
const { StockPoolManager } = require('./dist/stockPool');
const feishu = new FeishuClient({ appId: '${FEISHU_APP_ID}', appSecret: '${FEISHU_APP_SECRET}' });
const stockPool = new StockPoolManager('./data', 200);
const pool = stockPool.getPoolData();
const stocks = stockPool.getTopStocks(10);

const STOCK_DIVIDER = '━━━━━━━━━━━━━━━━━━━';
const INNER_DIVIDER = '‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑';

let msg = '📊 股票池 TOP10\n';
msg += STOCK_DIVIDER + '\n';
msg += '总数: ' + pool.totalCount + '/200\n\n';

stocks.forEach((s, i) => {
  msg += STOCK_DIVIDER + '\n';
  msg += (i+1) + '. ' + s.name + ' ' + s.code + '\n';
  msg += '评分: ' + s.totalScore + '/100 | ' + s.industry + '\n';
  msg += '✅ ' + s.advantages + '\n';
  msg += '⚠️ ' + s.risks + '\n\n';
});

feishu.sendUserMessage('${FEISHU_USER_OPEN_ID}', msg).then(() => console.log('已发送到飞书'));
"
    ;;
  daily)
    node -e "
const { FeishuClient } = require('./dist/feishu');
const { NewsCrawler } = require('./dist/news');
const { StockPoolManager } = require('./dist/stockPool');
const { FinanceScheduler } = require('./dist/scheduler');

const feishu = new FeishuClient({ appId: '${FEISHU_APP_ID}', appSecret: '${FEISHU_APP_SECRET}' });
const newsCrawler = new NewsCrawler(20);
const stockPool = new StockPoolManager('./data', 200);
const scheduler = new FinanceScheduler(feishu, newsCrawler, stockPool, {
  chatId: '${FEISHU_CHAT_ID}',
  userOpenId: '${FEISHU_USER_OPEN_ID}',
  dailyNewsCount: 20,
  stockPoolMax: 200,
});

console.log('执行每日抓取任务...');
scheduler.runDailyNewsCollection().then(() => console.log('任务完成'));
"
    ;;
  start)
    nohup npm run start > finance-monitor.log 2>&1 &
    echo "服务已启动 (PID: $!)"
    ;;
  stop)
    pkill -f "tsx src/index.ts" 2>/dev/null
    echo "服务已停止"
    ;;
  log)
    tail -30 finance-monitor.log
    ;;
  *)
    echo "📈 财经监控快捷命令"
    echo ""
    echo "用法: ./stock.sh {命令}"
    echo ""
    echo "命令:"
    echo "  status  - 完整股票池 (详细) → 飞书"
    echo "  top     - TOP10 股票 (简要) → 飞书"
    echo "  news    - 财经新闻 → 飞书"
    echo "  daily   - 执行每日抓取任务"
    echo "  start   - 启动后台服务"
    echo "  stop    - 停止后台服务"
    echo "  log     - 查看最近日志"
    ;;
esac