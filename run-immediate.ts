import * as dotenv from 'dotenv';
import path from 'path';
import { FeishuClient } from './src/feishu';
import { NewsCrawler } from './src/news';
import { StockPoolManager } from './src/stockPool';
import { FinanceScheduler } from './src/scheduler';

dotenv.config({ path: path.join(__dirname, 'skills/finance-monitor', '.env') });

const CONFIG = {
  FEISHU: {
    APP_ID: process.env.FEISHU_APP_ID || '',
    APP_SECRET: process.env.FEISHU_APP_SECRET || '',
  },
  USER_OPEN_ID: 'ou_ad70c7a42c69dec8464bb84eb114b0df',
  CHAT_ID: process.env.FEISHU_CHAT_ID || 'oc_04c5349b1fe02f96c7e144a2999e8309',
  DATA_ROOT: '/Users/ray/.openclaw/workspace-cia/skills/finance-monitor/data',
  STOCK_POOL_MAX: 200,
  DAILY_NEWS_COUNT: 20,
};

async function main() {
  console.log('初始化组件...');
  
  const feishu = new FeishuClient({
    appId: CONFIG.FEISHU.APP_ID,
    appSecret: CONFIG.FEISHU.APP_SECRET,
  });

  const newsCrawler = new NewsCrawler(CONFIG.DAILY_NEWS_COUNT);
  const stockPool = new StockPoolManager(CONFIG.DATA_ROOT, CONFIG.STOCK_POOL_MAX);
  const scheduler = new FinanceScheduler(feishu, newsCrawler, stockPool, {
    chatId: CONFIG.CHAT_ID,
    userOpenId: CONFIG.USER_OPEN_ID,
    dailyNewsCount: CONFIG.DAILY_NEWS_COUNT,
    stockPoolMax: CONFIG.STOCK_POOL_MAX,
  });

  console.log('执行每日财经抓取任务...');
  await scheduler.runDailyNewsCollection();
  console.log('任务执行完成');
}

main().catch(console.error);
