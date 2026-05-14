import * as dotenv from 'dotenv';
import path from 'path';
import { NewsCrawler } from './src/news';
import { StockPoolManager } from './src/stockPool';

dotenv.config({ path: path.join(__dirname, '.env') });

const DATA_ROOT = '/Users/ray/.openclaw/workspace-cia/skills/finance-monitor/data';
const DAILY_NEWS_COUNT = 20;

async function main() {
  const newsCrawler = new NewsCrawler(DAILY_NEWS_COUNT);
  const stockPool = new StockPoolManager(DATA_ROOT, 200);

  console.log('抓取财经信息...');
  const news = await newsCrawler.fetchDailyNews();
  console.log(`获取到 ${news.length} 条财经信息`);

  const poolData = stockPool.getPoolData();
  console.log(`股票池当前: ${poolData.totalCount}/200`);

  console.log('\n=== 新闻数据 ===');
  for (const item of news) {
    console.log(JSON.stringify(item));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('失败:', err);
  process.exit(1);
});
