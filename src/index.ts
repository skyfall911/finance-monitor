import * as dotenv from 'dotenv';
import path from 'path';
import { FeishuClient } from './feishu';
import { NewsCrawler } from './news';
import { StockPoolManager } from './stockPool';
import { FinanceScheduler } from './scheduler';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const CONFIG = {
  FEISHU: {
    APP_ID: process.env.FEISHU_APP_ID || '',
    APP_SECRET: process.env.FEISHU_APP_SECRET || '',
  },
  USER_OPEN_ID: process.env.FEISHU_USER_OPEN_ID || 'ou_38566054c15cc836073584ff5c5221b1',
  CHAT_ID: process.env.FEISHU_CHAT_ID || 'oc_04c5349b1fe02f96c7e144a2999e8309',
  DATA_ROOT: process.env.DATA_ROOT || '/Users/ray/.openclaw/workspace-cia/skills/finance-monitor/data',
  STOCK_POOL_MAX: parseInt(process.env.STOCK_POOL_MAX || '200', 10),
  DAILY_NEWS_COUNT: parseInt(process.env.DAILY_NEWS_COUNT || '20', 10),
};

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

console.log('═══════════════════════════════════════');
console.log('📈 财经信息监控与股票池管理系统');
console.log('═══════════════════════════════════════\n');

console.log('📋 当前配置:');
console.log(`   飞书用户: ${CONFIG.USER_OPEN_ID}`);
console.log(`   飞书群ID: ${CONFIG.CHAT_ID}`);
console.log(`   数据存储: ${CONFIG.DATA_ROOT}`);
console.log(`   股票池上限: ${CONFIG.STOCK_POOL_MAX}`);
console.log(`   每日新闻数: ${CONFIG.DAILY_NEWS_COUNT}\n`);

async function handleCommand(input: string): Promise<void> {
  const cmd = input.trim().toLowerCase();

  console.log(`\n📩 收到命令: ${cmd}`);

  try {
    if (cmd.includes('帮助')) {
      await showHelp();
    } else if (cmd.includes('财经新闻') || cmd.includes('新闻')) {
      await fetchAndSendNews();
    } else if (cmd.includes('股票池')) {
      await showStockPool();
    } else if (cmd.includes('添加股票')) {
      const stockName = input.replace(/添加股票/gi, '').trim();
      await addStock(stockName);
    } else if (cmd.includes('移除股票')) {
      const stockCode = input.replace(/移除股票/gi, '').trim();
      await removeStock(stockCode);
    } else if (cmd.includes('股票分析')) {
      const stockCode = input.replace(/股票分析/gi, '').trim();
      await analyzeStock(stockCode);
    } else if (cmd.includes('测试推送')) {
      await testPush();
    } else if (cmd.includes('立即抓取') || cmd.includes('立即执行')) {
      await scheduler.runDailyNewsCollection();
    } else if (cmd.includes('立即评估')) {
      await scheduler.runBiMonthlyEvaluation();
    } else {
      await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, `❓ 未知命令: ${cmd}\n\n请输入以下命令之一：\n- 帮助\n- 财经新闻\n- 股票池\n- 添加股票 [名称]\n- 移除股票 [代码]\n- 股票分析 [代码]\n- 测试推送\n- 立即抓取\n- 立即评估`);
    }
  } catch (error: any) {
    console.error('❌ 命令执行失败:', error.message);
    await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, `❌ 命令执行失败: ${error.message}`);
  }
}

async function showHelp(): Promise<void> {
  const helpText = `📈 财经信息监控与股票池管理系统

【可用命令】
• 帮助 - 显示此帮助信息
• 财经新闻 - 获取最新财经热点
• 股票池 - 查看当前股票池状态
• 添加股票 [名称] - 手动添加股票到股票池
• 移除股票 [代码] - 从股票池移除股票
• 股票分析 [代码] - 分析特定股票
• 测试推送 - 发送测试消息
• 立即抓取 - 立即执行财经信息抓取
• 立即评估 - 立即执行股票池评估

【定时任务】
• 每日 7:00 - 财经信息抓取 + 标的筛选
• 每日 12:30 - 财经信息抓取 + 标的筛选
• 每月 1/15 日 16:00 - 股票池整体评估

【评估指标】
• 投资潜力 (30%): 行业景气度、公司成长性、估值水平
• 市场热度 (20%): 换手率、资金净流入、涨停跌停次数
• 消息面 (20%): 利好利空消息数量、消息可信度
• 财务状况 (15%): 营收利润增速、资产负债率、现金流
• 诉讼风险 (10%): 未结案诉讼、诉讼金额占比
• 近期表现 (5%): 近5/10/20交易日涨跌幅

【股票池规则】
• 上限: 200 支股票
• 新增标的按评估总分排序
• 超限自动剔除排名 200 以后的标的`;

  await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, helpText);
  console.log('✅ 帮助信息已发送');
}

async function fetchAndSendNews(): Promise<void> {
  await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, '📡 正在抓取最新财经信息...');

  try {
    const news = await newsCrawler.fetchDailyNews();
    const poolData = stockPool.getPoolData();

    let message = `📈 每日财经热点\n${new Date().toISOString().split('T')[0]}\n\n`;

    message += `━━━━━━━━ 核心财经信息 ━━━━━━━━\n`;
    for (let i = 0; i < Math.min(news.length, 10); i++) {
      const item = news[i];
      message += `${i + 1}. ${item.title}\n`;
      message += `   📝 ${item.content.substring(0, 50)}...\n`;
      message += `   ${item.source} | ${item.relatedMarket}\n\n`;
    }

    message += `━━━━━━━━ 股票池状态 ━━━━━━━━\n`;
    message += `当前总数: ${poolData.totalCount}/${CONFIG.STOCK_POOL_MAX}`;

    await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, message);
    console.log('✅ 财经新闻已发送');
  } catch (error: any) {
    console.error('❌ 抓取新闻失败:', error.message);
    await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, `❌ 抓取失败: ${error.message}`);
  }
}

async function showStockPool(): Promise<void> {
  const poolData = stockPool.getPoolData();
  const topStocks = stockPool.getTopStocks(10);

  let message = `📊 股票池状态\n`;
  message += `总数: ${poolData.totalCount}/${CONFIG.STOCK_POOL_MAX}\n`;
  message += `评估: ${poolData.lastEvaluationDate || '从未'}\n\n`;
  message += `━━━━━━━━ TOP10 ━━━━━━━━\n`;

  for (let i = 0; i < topStocks.length; i++) {
    const stock = topStocks[i];
    message += `${i + 1}. ${stock.name} ${stock.code}\n`;
    message += `   ${stock.industry} | 评分: ${stock.totalScore}\n`;
  }

  await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, message);
  console.log('✅ 股票池状态已发送');
}

async function addStock(stockName: string): Promise<void> {
  if (!stockName) {
    await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, '⚠️ 请提供股票名称，如：添加股票 宁德时代');
    return;
  }

  await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, `🔍 正在搜索股票: ${stockName}...`);

  try {
    const results = await stockPool.searchStocks(stockName);

    if (results.length === 0) {
      await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, `❌ 未找到股票: ${stockName}`);
      return;
    }

    const stock = results[0];
    const result = await stockPool.addStock(stock);

    if (result.success) {
      await feishu.sendUserMessage(
        CONFIG.USER_OPEN_ID,
        `✅ ${stock.name}(${stock.code}) 已加入股票池\n\n行业: ${stock.industry}\n市值: ${stock.marketCap?.toFixed(0) || '未知'}亿\n主营业务: ${stock.mainBusiness || '未知'}`
      );
    } else {
      await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, `⚠️ ${result.message}`);
    }
  } catch (error: any) {
    console.error('❌ 添加股票失败:', error.message);
    await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, `❌ 添加失败: ${error.message}`);
  }
}

async function removeStock(stockCode: string): Promise<void> {
  if (!stockCode) {
    await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, '⚠️ 请提供股票代码，如：移除股票 300750');
    return;
  }

  const result = stockPool.removeStock(stockCode, '手动移除');
  await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
}

async function analyzeStock(stockCode: string): Promise<void> {
  if (!stockCode) {
    await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, '⚠️ 请提供股票代码，如：股票分析 300750');
    return;
  }

  const stock = stockPool.getStockByCode(stockCode);

  if (!stock) {
    await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, `❌ 股票 ${stockCode} 不在股票池中`);
    return;
  }

  const message = `📝 股票分析 | ${stock.name}(${stockCode})

┌─────────────────────────────────────┐
📊 基础信息
• 行业: ${stock.industry}
• 板块: ${stock.board}
• 市值: ${stock.marketCap?.toFixed(0) || '未知'}亿
• 主营业务: ${stock.mainBusiness}
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
📈 评估得分 | 总分: ${stock.totalScore}/100
• 投资潜力: ${stock.scores.investmentPotential}/100 (30%)
• 市场热度: ${stock.scores.marketHotness}/100 (20%)
• 消息面: ${stock.scores.newsSentiment}/100 (20%)
• 财务状况: ${stock.scores.financialHealth}/100 (15%)
• 诉讼风险: ${stock.scores.litigationRisk}/100 (10%)
• 近期表现: ${stock.scores.recentPerformance}/100 (5%)
└─────────────────────────────────────┘

✅ 核心优势: ${stock.advantages}

⚠️ 主要风险: ${stock.risks}

📅 加入日期: ${stock.addedDate}
🏆 当前排名: ${stock.rank || '未知'}/${CONFIG.STOCK_POOL_MAX}`;

  await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, message);
}

async function testPush(): Promise<void> {
  await feishu.sendUserMessage(CONFIG.USER_OPEN_ID, '🧪 这是一条测试消息，技能运行正常！');
  console.log('✅ 测试推送已发送');
}

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('📌 命令行模式：');
console.log('   输入命令直接执行');
console.log('   输入 "启动定时" 开始定时任务');
console.log('   输入 "退出" 结束程序\n');

rl.setPrompt('\n请输入命令 (help/帮助): ');
rl.prompt();

rl.on('line', async (input: string) => {
  const cmd = input.trim().toLowerCase();

  if (cmd === '退出' || cmd === 'exit' || cmd === 'quit') {
    scheduler.cancelAllSchedules();
    rl.close();
    return;
  }

  if (cmd === '启动定时' || cmd === 'start') {
    scheduler.startAllSchedules();
    console.log('✅ 定时任务已启动');
    rl.prompt();
    return;
  }

  await handleCommand(input);
  rl.prompt();
}).on('close', () => {
  console.log('\n👋 再见！');
  process.exit(0);
});

export { handleCommand, showHelp, fetchAndSendNews, showStockPool, addStock, removeStock, analyzeStock, testPush };
