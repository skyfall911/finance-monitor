import * as schedule from 'node-schedule';
import { FeishuClient } from './feishu';
import { NewsCrawler } from './news';
import { StockPoolManager, StockInfo } from './stockPool';

export interface SchedulerConfig {
  chatId: string;
  userOpenId: string;
  dailyNewsCount: number;
  stockPoolMax: number;
}

export class FinanceScheduler {
  private feishu: FeishuClient;
  private newsCrawler: NewsCrawler;
  private stockPool: StockPoolManager;
  private config: SchedulerConfig;
  private scheduledJobs: schedule.Job[] = [];

  constructor(
    feishu: FeishuClient,
    newsCrawler: NewsCrawler,
    stockPool: StockPoolManager,
    config: SchedulerConfig
  ) {
    this.feishu = feishu;
    this.newsCrawler = newsCrawler;
    this.stockPool = stockPool;
    this.config = config;
  }

  startAllSchedules(): void {
    this.scheduleDailyNewsCollection();
    this.scheduleBiMonthlyEvaluation();

    console.log('✅ 财经监控定时任务已启动');
  }

  private scheduleDailyNewsCollection(): void {
    const job1 = schedule.scheduleJob('0 7 * * *', async () => {
      console.log('[定时任务] 每日 7:00 - 财经信息抓取');
      await this.runDailyNewsCollection();
    });
    if (job1) this.scheduledJobs.push(job1);

    const job2 = schedule.scheduleJob('0 12:30 * * *', async () => {
      console.log('[定时任务] 每日 12:30 - 财经信息抓取');
      await this.runDailyNewsCollection();
    });
    if (job2) this.scheduledJobs.push(job2);

    console.log('✅ 每日 7:00、12:30 财经抓取任务已设置');
  }

  private scheduleBiMonthlyEvaluation(): void {
    const job1 = schedule.scheduleJob('0 16 1 * *', async () => {
      console.log('[定时任务] 每月 1 日 16:00 - 股票池整体评估');
      await this.runBiMonthlyEvaluation();
    });
    if (job1) this.scheduledJobs.push(job1);

    const job2 = schedule.scheduleJob('0 16 15 * *', async () => {
      console.log('[定时任务] 每月 15 日 16:00 - 股票池整体评估');
      await this.runBiMonthlyEvaluation();
    });
    if (job2) this.scheduledJobs.push(job2);

    console.log('✅ 每月 1 日、15 日 16:00 股票池评估任务已设置');
  }

  async runDailyNewsCollection(): Promise<void> {
    try {
      console.log('📡 开始抓取财经信息...');
      const news = await this.newsCrawler.fetchDailyNews();
      console.log(`✅ 获取到 ${news.length} 条财经信息`);

      const relatedStocks = await this.findRelatedStocks(news);
      console.log(`✅ 匹配到 ${relatedStocks.length} 支相关股票`);

      const newStocks = await this.evaluateAndAddStocks(relatedStocks);

      const poolData = this.stockPool.getPoolData();

      const message = this.formatDailyMessage(news, newStocks, poolData.totalCount);

      await this.feishu.sendUserMessage(this.config.userOpenId, message);
      console.log('✅ 每日财经推送已发送');

      if (poolData.totalCount > this.config.stockPoolMax * 0.9) {
        await this.feishu.sendUserMessage(
          this.config.userOpenId,
          `⚠️ 股票池预警：当前 ${poolData.totalCount}/${this.config.stockPoolMax} 支，即将满额`
        );
      }
    } catch (error: any) {
      console.error('❌ 每日财经抓取失败:', error.message);
      await this.feishu.sendUserMessage(
        this.config.userOpenId,
        `❌ 数据抓取异常: ${error.message}\n\n请检查网络连接或数据源状态。`
      );
    }
  }

  private isAStock(code: string): boolean {
    return /^(00|60|68|30|83|43)\d{4}$/.test(code);
  }

  private async findRelatedStocks(news: any[]): Promise<any[]> {
    const matchedStocks: any[] = [];
    const existingCodes = new Set(this.stockPool.getPoolData().stocks.map(s => s.code));

    for (const item of news.slice(0, 10)) {
      const text = item.title + item.content;
      const relatedMarket = item.relatedMarket || '';

      const keywords = this.extractKeywords(text, relatedMarket);

      for (const keyword of keywords) {
        if (matchedStocks.length >= 10) break;

        try {
          const searchResults = await this.stockPool.searchStocks(keyword);

          for (const stock of searchResults) {
            if (matchedStocks.length >= 10) break;
            if (existingCodes.has(stock.code)) continue;
            if (matchedStocks.find(s => s.code === stock.code)) continue;
            if (!this.isAStock(stock.code)) continue;

            matchedStocks.push({
              code: stock.code,
              name: stock.name,
              industry: stock.industry || relatedMarket || '综合',
              board: stock.board || '未知',
              marketCap: stock.marketCap || 0,
              mainBusiness: stock.mainBusiness || '未知',
            });
            existingCodes.add(stock.code);
          }
        } catch (error) {
          console.error(`搜索股票 "${keyword}" 失败:`, error);
        }
      }

      if (matchedStocks.length >= 10) break;
    }

    return matchedStocks.slice(0, 10);
  }

  private extractKeywords(text: string, relatedMarket: string): string[] {
    const keywords: string[] = [];

    const industryPatterns: { [key: string]: RegExp[] } = {
      '新能源': [/新能源/i, /光伏/i, /风电/i, /锂电池/i, /储能/i, /电动车/i, /碳中和/i],
      '半导体': [/半导体/i, /芯片/i, /集成电路/i, /晶圆/i, /光刻机/i, /AI.*芯片/i, /GPU/i],
      '医药': [/医药/i, /生物医药/i, /疫苗/i, /医疗器械/i, /中药/i, /创新药/i],
      '消费': [/消费/i, /白酒/i, /食品/i, /家电/i, /零售/i, /餐饮/i],
      '金融': [/银行/i, /保险/i, /券商/i, /证券/i, /基金/i],
      '科技': [/人工智能/i, /5G/i, /云计算/i, /大数据/i, /区块链/i, /元宇宙/i, /AI/i],
      '房地产': [/房地产/i, /地产/i, /建筑/i, /建材/i, /物业/i],
      '军工': [/军工/i, /国防/i, /航天/i, /航空/i, /船舶/i, /卫星/i],
      '周期': [/钢铁/i, /煤炭/i, /有色/i, /化工/i, /水泥/i, /石油/i, /大宗商品/i],
    };

    for (const [industry, patterns] of Object.entries(industryPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          if (!keywords.includes(industry)) {
            keywords.push(industry);
          }
          break;
        }
      }
    }

    const stockNamePattern = /([\u4e00-\u9fa5]{2,6})(?:股票|股|上市|代码|股价)/g;
    const matches = text.match(stockNamePattern);
    if (matches) {
      for (const match of matches) {
        const name = match.replace(/(?:股票|股|上市|代码|股价)/g, '');
        if (name.length >= 2 && name.length <= 6) {
          keywords.push(name);
        }
      }
    }

    if (relatedMarket && !keywords.includes(relatedMarket)) {
      keywords.unshift(relatedMarket);
    }

    return keywords.slice(0, 5);
  }

  private getIndustryKeywords(industry: string): string[] {
    const keywords: { [key: string]: string[] } = {
      '新能源': ['新能源', '光伏', '风电', '锂电池', '储能', '电动车', '电动汽车', '碳中和', '动力电池', '充电桩'],
      '半导体': ['半导体', '芯片', '集成电路', '晶圆', '光刻机', 'AI芯片', 'GPU', '半导体设备', '封测'],
      '医药': ['医药', '生物医药', '疫苗', '医疗器械', '中药', '创新药', 'CRO', '医疗', '医院'],
      '消费': ['消费', '白酒', '食品', '家电', '纺织', '零售', '餐饮', '旅游', '酒店', '家电', '汽车销售'],
      '金融': ['银行', '保险', '券商', '证券', '基金', '信托', '期货', '数字货币', '金融科技', '财富管理'],
      '科技': ['科技', '人工智能', '5G', '云计算', '大数据', '区块链', '元宇宙', '数字经济', '算力', 'AI', '机器人'],
      '房地产': ['房地产', '地产', '建筑', '建材', '物业', '家居', '购房', '楼市', '开发商'],
      '军工': ['军工', '国防', '航天', '航空', '船舶', '卫星', '无人机', '军工', '武器', '军品'],
      '周期': ['钢铁', '煤炭', '有色', '化工', '水泥', '石油', '天然气', '大宗商品', '海运', '航运', '稀土'],
    };
    return keywords[industry] || [];
  }

  private getStockBoard(name: string): string {
    const boardMap: { [key: string]: string } = {
      '宁德时代': '创业板', '亿纬锂能': '创业板', '迈瑞医疗': '创业板', '东方财富': '创业板',
      '中芯国际': '科创板', '隆基绿能': '主板', '通威股份': '主板',
    };
    return boardMap[name] || '主板';
  }

  private getStockMarketCap(name: string): number {
    const marketCapMap: { [key: string]: number } = {
      '宁德时代': 8500, '比亚迪': 6500, '隆基绿能': 1800, '通威股份': 1500, '亿纬锂能': 1200,
      '中芯国际': 4200, '韦尔股份': 1200, '北方华创': 1500, '兆易创新': 800, '长电科技': 600,
      '恒瑞医药': 2800, '药明康德': 2200, '迈瑞医疗': 3200, '片仔癀': 1800, '云南白药': 1000,
      '贵州茅台': 22000, '五粮液': 5500, '美的集团': 3800, '格力电器': 2100, '伊利股份': 1500,
      '中国平安': 8500, '招商银行': 9500, '宁波银行': 1800, '东方财富': 2800, '中信证券': 2500,
      '立讯精密': 2100, '歌尔股份': 900, '海康威视': 3500, '中兴通讯': 1500, '科大讯飞': 1200,
    };
    return marketCapMap[name] || Math.random() * 5000 + 500;
  }

  private getStockMainBusiness(name: string): string {
    const businessMap: { [key: string]: string } = {
      '宁德时代': '动力电池系统、储能系统研发生产', '比亚迪': '新能源汽车、动力电池、手机部件制造',
      '隆基绿能': '光伏单晶硅片、组件研发生产', '通威股份': '光伏硅料、电池片、饲料',
      '亿纬锂能': '锂原电池、动力电池研发生产', '中芯国际': '集成电路晶圆代工',
      '韦尔股份': '半导体芯片设计', '北方华创': '半导体设备制造', '兆易创新': '存储器芯片设计',
      '长电科技': '集成电路封测', '恒瑞医药': '创新药研发', '药明康德': '医药研发服务',
      '迈瑞医疗': '医疗器械研发生产', '片仔癀': '中成药制造', '云南白药': '中药制造',
      '贵州茅台': '高端白酒酿造', '五粮液': '高端白酒酿造', '美的集团': '家电制造',
      '格力电器': '空调制造', '伊利股份': '乳制品制造', '中国平安': '保险银行投资',
      '招商银行': '商业银行业务', '宁波银行': '商业银行业务', '东方财富': '互联网券商',
      '中信证券': '证券业务', '立讯精密': '精密制造', '歌尔股份': '声学精密制造',
      '海康威视': '安防设备制造', '中兴通讯': '通信设备制造', '科大讯飞': '人工智能',
    };
    return businessMap[name] || '行业龙头企业';
  }

  private getStockCode(name: string): string {
    const codeMap: { [key: string]: string } = {
      '宁德时代': '300750',
      '比亚迪': '002594',
      '隆基绿能': '601012',
      '通威股份': '600438',
      '亿纬锂能': '300014',
      '中芯国际': '688981',
      '韦尔股份': '603501',
      '北方华创': '002371',
      '兆易创新': '603986',
      '长电科技': '600584',
      '恒瑞医药': '600276',
      '药明康德': '603259',
      '迈瑞医疗': '300760',
      '片仔癀': '600436',
      '云南白药': '000538',
      '贵州茅台': '600519',
      '五粮液': '000858',
      '美的集团': '000333',
      '格力电器': '000651',
      '伊利股份': '600887',
      '中国平安': '601318',
      '招商银行': '600036',
      '宁波银行': '002142',
      '东方财富': '300059',
      '中信证券': '600030',
      '立讯精密': '002475',
      '歌尔股份': '002241',
      '海康威视': '002415',
      '中兴通讯': '000063',
      '科大讯飞': '002230',
    };
    return codeMap[name] || `${Math.floor(Math.random() * 900000 + 100000)}`;
  }

  private async evaluateAndAddStocks(stocks: any[]): Promise<StockInfo[]> {
    const addedStocks: StockInfo[] = [];

    for (const stock of stocks) {
      const result = await this.stockPool.addStock(stock);
      if (result.success) {
        const added = this.stockPool.getStockByCode(stock.code);
        if (added) addedStocks.push(added);
      }
    }

    return addedStocks;
  }

  private formatDailyMessage(news: any[], newStocks: StockInfo[], totalCount: number): string {
    const today = new Date().toISOString().split('T')[0];

    let message = `📈 每日财经热点与股票池更新\n${today}\n\n`;

    message += `━━━━━━━━ 核心财经信息 ━━━━━━━━\n`;
    for (let i = 0; i < Math.min(news.length, 10); i++) {
      const item = news[i];
      message += `${i + 1}. ${item.title}\n`;
      message += `   📝 ${item.content.substring(0, 50)}...\n`;
      message += `   ${item.source} | ${item.relatedMarket}\n\n`;
    }

    if (newStocks.length > 0) {
      message += `━━━━━━━━ 新增股票标的 ━━━━━━━━\n`;
      for (const stock of newStocks) {
        message += `【${stock.name}】${stock.code}\n`;
        message += `行业: ${stock.industry} | 市值: ${stock.marketCap.toFixed(0)}亿\n`;
        message += `评分: ${stock.totalScore}/100\n`;
        message += `✅ ${stock.advantages}\n`;
        message += `⚠️ ${stock.risks}\n\n`;
      }
    }

    message += `━━━━━━━━ 股票池状态 ━━━━━━━━\n`;
    message += `当前总数: ${totalCount}/${this.config.stockPoolMax}`;

    return message;
  }

  async runBiMonthlyEvaluation(): Promise<void> {
    try {
      console.log('📊 开始股票池半月度整体评估...');

      const { removed, updated } = await this.stockPool.evaluateAllStocks();

      const topStocks = this.stockPool.getTopStocks(10);
      const today = new Date().toISOString().split('T')[0];

      let message = `📋 股票池半月度整体评估 | 【${today}】\n\n`;
      message += `┌─────────────────────────────────────┐\n`;
      message += `📈 整体排名TOP10\n`;

      for (let i = 0; i < topStocks.length; i++) {
        const stock = topStocks[i];
        let change = '';
        if (stock.previousRank && stock.rank && stock.previousRank !== stock.rank) {
          const diff = stock.previousRank - stock.rank;
          change = diff > 0 ? `↑${diff}名` : `↓${Math.abs(diff)}名`;
        }
        message += `${i + 1}. ${stock.name}(${stock.code}) | 总分:${stock.totalScore} | ${change}\n`;
      }

      message += `└─────────────────────────────────────┘\n\n`;

      if (removed.length > 0) {
        message += `❌ 本期剔除标的（${removed.length}支）\n`;

        for (const stock of removed.slice(0, 10)) {
          message += `• ${stock.name}(${stock.code}) | ${stock.removeReason}\n`;
        }

        if (removed.length > 10) {
          message += `...及其他 ${removed.length - 10} 支\n`;
        }
      }

      const poolData = this.stockPool.getPoolData();
      message += `┌─────────────────────────────────────┐\n`;
      message += `📊 股票池当前总数：${poolData.totalCount}/${this.config.stockPoolMax}\n`;
      message += `└─────────────────────────────────────┘\n\n`;

      const topIndustry = this.analyzeTopIndustry(topStocks);
      message += `💡 本期核心结论：${topIndustry}`;

      await this.feishu.sendUserMessage(this.config.userOpenId, message);
      console.log('✅ 股票池半月度评估推送已发送');
    } catch (error: any) {
      console.error('❌ 股票池评估失败:', error.message);
      await this.feishu.sendUserMessage(
        this.config.userOpenId,
        `❌ 股票池评估异常: ${error.message}`
      );
    }
  }

  private analyzeTopIndustry(topStocks: StockInfo[]): string {
    const industryCount: { [key: string]: number } = {};
    for (const stock of topStocks) {
      industryCount[stock.industry] = (industryCount[stock.industry] || 0) + 1;
    }

    const sorted = Object.entries(industryCount).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      return `${sorted[0][0]}板块标的排名普遍靠前，整体表现强劲`;
    }
    return '股票池整体表现平稳';
  }

  cancelAllSchedules(): void {
    this.scheduledJobs.forEach((job) => {
      job.cancel();
    });
    this.scheduledJobs = [];
    console.log('✅ 所有定时任务已取消');
  }
}
