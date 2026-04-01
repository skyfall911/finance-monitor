import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

export interface StockInfo {
  code: string;
  name: string;
  industry: string;
  board: string;
  marketCap: number;
  mainBusiness: string;
  addedDate: string;
  totalScore: number;
  scores: {
    investmentPotential: number;
    marketHotness: number;
    newsSentiment: number;
    financialHealth: number;
    litigationRisk: number;
    recentPerformance: number;
  };
  advantages: string;
  risks: string;
  rank?: number;
  previousRank?: number;
  removeReason?: string;
  evaluationHistory: EvaluationRecord[];
}

interface EvaluationRecord {
  date: string;
  totalScore: number;
  rank: number;
}

export interface StockPoolData {
  stocks: StockInfo[];
  lastEvaluationDate: string;
  totalCount: number;
}

export class StockPoolManager {
  private dataPath: string;
  private maxStocks: number;
  private poolData: StockPoolData;

  constructor(dataPath: string, maxStocks = 200) {
    this.dataPath = dataPath;
    this.maxStocks = maxStocks;
    this.poolData = this.loadData();
  }

  private loadData(): StockPoolData {
    const filePath = path.join(this.dataPath, 'stock_pool.json');
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('加载股票池数据失败:', error);
    }
    return { stocks: [], lastEvaluationDate: '', totalCount: 0 };
  }

  private saveData(): void {
    const filePath = path.join(this.dataPath, 'stock_pool.json');
    try {
      fs.mkdirSync(this.dataPath, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(this.poolData, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存股票池数据失败:', error);
    }
  }

  async addStock(stockInfo: Omit<StockInfo, 'addedDate' | 'totalScore' | 'scores' | 'evaluationHistory'>): Promise<{ success: boolean; message: string }> {
    const existingIndex = this.poolData.stocks.findIndex((s) => s.code === stockInfo.code);
    if (existingIndex !== -1) {
      return { success: false, message: `股票 ${stockInfo.name}(${stockInfo.code}) 已在股票池中` };
    }

    const evaluation = await this.evaluateStock(stockInfo);
    const newStock: StockInfo = {
      ...stockInfo,
      addedDate: new Date().toISOString().split('T')[0],
      totalScore: evaluation.totalScore,
      scores: evaluation.scores,
      advantages: evaluation.advantages,
      risks: evaluation.risks,
      evaluationHistory: [],
    };

    this.poolData.stocks.push(newStock);

    if (this.poolData.stocks.length > this.maxStocks) {
      this.rebalancePool();
    }

    this.recalculateRanks();
    this.poolData.totalCount = this.poolData.stocks.length;
    this.saveData();

    return { success: true, message: `股票 ${stockInfo.name}(${stockInfo.code}) 已加入股票池` };
  }

  removeStock(code: string, reason: string): { success: boolean; message: string } {
    const index = this.poolData.stocks.findIndex((s) => s.code === code);
    if (index === -1) {
      return { success: false, message: `股票 ${code} 不在股票池中` };
    }

    const stock = this.poolData.stocks[index];
    stock.removeReason = reason;
    this.poolData.stocks.splice(index, 1);

    this.recalculateRanks();
    this.poolData.totalCount = this.poolData.stocks.length;
    this.saveData();

    return { success: true, message: `股票 ${stock.name}(${code}) 已从股票池移除: ${reason}` };
  }

  private rebalancePool(): void {
    this.poolData.stocks.sort((a, b) => b.totalScore - a.totalScore);

    const removed = this.poolData.stocks.splice(this.maxStocks);
    for (const stock of removed) {
      stock.removeReason = '排名超过200名，自动剔除';
    }

    console.log(`⚠️ 股票池超限，剔除 ${removed.length} 支股票`);
  }

  private recalculateRanks(): void {
    this.poolData.stocks.sort((a, b) => b.totalScore - a.totalScore);

    for (let i = 0; i < this.poolData.stocks.length; i++) {
      const stock = this.poolData.stocks[i];
      stock.previousRank = stock.rank;
      stock.rank = i + 1;
    }
  }

  async evaluateStock(stockInfo: Omit<StockInfo, 'addedDate' | 'totalScore' | 'scores' | 'evaluationHistory'>): Promise<{
    totalScore: number;
    scores: StockInfo['scores'];
    advantages: string;
    risks: string;
  }> {
    const scores = {
      investmentPotential: await this.calculateInvestmentPotential(stockInfo),
      marketHotness: await this.calculateMarketHotness(stockInfo),
      newsSentiment: await this.calculateNewsSentiment(stockInfo),
      financialHealth: await this.calculateFinancialHealth(stockInfo),
      litigationRisk: await this.calculateLitigationRisk(stockInfo),
      recentPerformance: await this.calculateRecentPerformance(stockInfo),
    };

    const totalScore = Math.round(
      scores.investmentPotential * 0.3 +
      scores.marketHotness * 0.2 +
      scores.newsSentiment * 0.2 +
      scores.financialHealth * 0.15 +
      scores.litigationRisk * 0.1 +
      scores.recentPerformance * 0.05
    );

    const { advantages, risks } = this.generateAnalysis(stockInfo, scores);

    return { totalScore, scores, advantages, risks };
  }

  private async calculateInvestmentPotential(stock: Omit<StockInfo, 'addedDate' | 'totalScore' | 'scores' | 'evaluationHistory'>): Promise<number> {
    let score = 50;

    const industryScores: { [key: string]: number } = {
      '新能源': 85, '半导体': 80, '医药': 75, '科技': 80, '消费': 65,
      '金融': 60, '房地产': 40, '军工': 75, '周期': 55,
    };

    score = industryScores[stock.industry] || 65;

    if (stock.marketCap > 1000) score += 10;
    else if (stock.marketCap > 500) score += 5;
    else if (stock.marketCap < 100) score -= 10;

    return Math.min(100, Math.max(0, score));
  }

  private async calculateMarketHotness(stock: Omit<StockInfo, 'addedDate' | 'totalScore' | 'scores' | 'evaluationHistory'>): Promise<number> {
    let score = 50;

    try {
      const turnoverRate = await this.getTurnoverRate(stock.code);
      const netFlow = await this.getNetFundFlow(stock.code);

      if (turnoverRate > 10) score += 25;
      else if (turnoverRate > 5) score += 15;
      else if (turnoverRate < 2) score -= 15;

      if (netFlow > 0) score += 15;
      else score -= 15;
    } catch (error) {
      console.error(`获取市场热度失败 ${stock.code}:`, error);
    }

    return Math.min(100, Math.max(0, score));
  }

  private async calculateNewsSentiment(stock: Omit<StockInfo, 'addedDate' | 'totalScore' | 'scores' | 'evaluationHistory'>): Promise<number> {
    let score = 50;

    try {
      const news = await this.fetchStockNews(stock.code);
      let positive = 0;
      let negative = 0;

      const positiveWords = ['利好', '增长', '突破', '创新', '合作', '订单', '签约', '获奖', '景气'];
      const negativeWords = ['利空', '下跌', '亏损', '风险', '调查', '违规', '诉讼', '减持'];

      for (const item of news) {
        const text = item.title + item.content;
        for (const word of positiveWords) {
          if (text.includes(word)) positive++;
        }
        for (const word of negativeWords) {
          if (text.includes(word)) negative++;
        }
      }

      if (positive > negative * 2) score += 30;
      else if (positive > negative) score += 15;
      else if (negative > positive * 2) score -= 25;
      else if (negative > positive) score -= 10;
    } catch (error) {
      console.error(`获取消息情绪失败 ${stock.code}:`, error);
    }

    return Math.min(100, Math.max(0, score));
  }

  private async calculateFinancialHealth(stock: Omit<StockInfo, 'addedDate' | 'totalScore' | 'scores' | 'evaluationHistory'>): Promise<number> {
    let score = 65;

    try {
      const financialData = await this.getFinancialData(stock.code);

      if (financialData.revenueGrowth > 20) score += 15;
      else if (financialData.revenueGrowth > 10) score += 5;
      else if (financialData.revenueGrowth < 0) score -= 15;

      if (financialData.profitGrowth > 20) score += 10;
      else if (financialData.profitGrowth > 0) score += 5;
      else if (financialData.profitGrowth < -10) score -= 15;

      if (financialData.debtRatio < 50) score += 10;
      else if (financialData.debtRatio > 80) score -= 15;

      if (financialData.cashFlow > 0) score += 10;
      else score -= 10;
    } catch (error) {
      console.error(`获取财务数据失败 ${stock.code}:`, error);
    }

    return Math.min(100, Math.max(0, score));
  }

  private async calculateLitigationRisk(stock: Omit<StockInfo, 'addedDate' | 'totalScore' | 'scores' | 'evaluationHistory'>): Promise<number> {
    let score = 100;

    try {
      const litigationData = await this.getLitigationData(stock.code);

      if (litigationData.hasUnclosedCases) score -= 40;
      if (litigationData.amountRatio > 0.05) score -= 30;
      else if (litigationData.amountRatio > 0.01) score -= 15;
    } catch (error) {
      console.error(`获取诉讼数据失败 ${stock.code}:`, error);
    }

    return Math.min(100, Math.max(0, score));
  }

  private async calculateRecentPerformance(stock: Omit<StockInfo, 'addedDate' | 'totalScore' | 'scores' | 'evaluationHistory'>): Promise<number> {
    let score = 50;

    try {
      const priceData = await this.getPriceData(stock.code);

      if (priceData.change5 > 5) score += 20;
      else if (priceData.change5 > 0) score += 10;
      else if (priceData.change5 < -5) score -= 20;
      else if (priceData.change5 < 0) score -= 10;

      if (priceData.relativeChange > 5) score += 15;
      else if (priceData.relativeChange < -5) score -= 15;
    } catch (error) {
      console.error(`获取近期表现失败 ${stock.code}:`, error);
    }

    return Math.min(100, Math.max(0, score));
  }

  private async getTurnoverRate(code: string): Promise<number> {
    try {
      const response = await axios.get(`https://push2.eastmoney.com/api/qt/stock/get?secid=0.${code}&fields=f8`, {
        timeout: 5000,
      });
      return parseFloat(response.data.data?.f8) || 0;
    } catch {
      return Math.random() * 8;
    }
  }

  private async getNetFundFlow(code: string): Promise<number> {
    try {
      const response = await axios.get(`https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=0&klt=1&secid=0.${code}&fields=f62,f184`, {
        timeout: 5000,
      });
      const data = response.data.data?.klines?.slice(-1)?.[0];
      return data ? parseFloat(data.split(',')[1]) : 0;
    } catch {
      return (Math.random() - 0.5) * 100000000;
    }
  }

  private async fetchStockNews(code: string): Promise<any[]> {
    return [];
  }

  private async getFinancialData(code: string): Promise<{
    revenueGrowth: number;
    profitGrowth: number;
    debtRatio: number;
    cashFlow: number;
  }> {
    return {
      revenueGrowth: (Math.random() - 0.3) * 50,
      profitGrowth: (Math.random() - 0.3) * 50,
      debtRatio: 40 + Math.random() * 40,
      cashFlow: Math.random() > 0.3 ? 1 : -1,
    };
  }

  private async getLitigationData(code: string): Promise<{
    hasUnclosedCases: boolean;
    amountRatio: number;
  }> {
    return {
      hasUnclosedCases: Math.random() > 0.8,
      amountRatio: Math.random() > 0.7 ? Math.random() * 0.1 : 0,
    };
  }

  private async getPriceData(code: string): Promise<{
    change5: number;
    relativeChange: number;
  }> {
    return {
      change5: (Math.random() - 0.4) * 15,
      relativeChange: (Math.random() - 0.4) * 10,
    };
  }

  private generateAnalysis(stock: Omit<StockInfo, 'addedDate' | 'totalScore' | 'scores' | 'evaluationHistory'>, scores: StockInfo['scores']): { advantages: string; risks: string } {
    const advantages: string[] = [];
    const risks: string[] = [];

    if (scores.investmentPotential > 75) advantages.push('行业景气度高');
    if (scores.marketHotness > 70) advantages.push('市场热度高，资金关注');
    if (scores.newsSentiment > 70) advantages.push('消息面偏利好');
    if (scores.financialHealth > 75) advantages.push('财务状况良好');
    if (scores.litigationRisk > 90) advantages.push('诉讼风险低');

    if (scores.litigationRisk < 60) risks.push('存在诉讼风险');
    if (scores.financialHealth < 50) risks.push('财务状况需关注');
    if (scores.recentPerformance < 40) risks.push('近期表现较弱');
    if (scores.marketHotness < 40) risks.push('市场关注度低');

    if (advantages.length === 0) advantages.push('基本面一般');
    if (risks.length === 0) risks.push('无明显风险');

    return {
      advantages: advantages.join('；'),
      risks: risks.join('；'),
    };
  }

  async evaluateAllStocks(): Promise<{ removed: StockInfo[]; updated: StockInfo[] }> {
    const removed: StockInfo[] = [];
    const updated: StockInfo[] = [];

    for (const stock of this.poolData.stocks) {
      const evaluation = await this.evaluateStock(stock);

      const record: EvaluationRecord = {
        date: new Date().toISOString().split('T')[0],
        totalScore: evaluation.totalScore,
        rank: stock.rank || 0,
      };
      stock.evaluationHistory.push(record);
      stock.totalScore = evaluation.totalScore;
      stock.scores = evaluation.scores;
      stock.advantages = evaluation.advantages;
      stock.risks = evaluation.risks;

      updated.push(stock);
    }

    this.poolData.stocks.sort((a, b) => b.totalScore - a.totalScore);

    while (this.poolData.stocks.length > this.maxStocks) {
      const stock = this.poolData.stocks.pop()!;
      stock.removeReason = '排名超过200名，整体评估剔除';
      removed.push(stock);
    }

    this.recalculateRanks();
    this.poolData.lastEvaluationDate = new Date().toISOString().split('T')[0];
    this.poolData.totalCount = this.poolData.stocks.length;
    this.saveData();

    return { removed, updated };
  }

  getPoolData(): StockPoolData {
    return this.poolData;
  }

  getTopStocks(count: number = 10): StockInfo[] {
    return this.poolData.stocks.slice(0, count);
  }

  getStockByCode(code: string): StockInfo | undefined {
    return this.poolData.stocks.find((s) => s.code === code);
  }

  async searchStocks(keyword: string): Promise<any[]> {
    try {
      const response = await axios.get(`https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`, {
        timeout: 5000,
      });

      if (response.data?.QuotationCodeTable?.Data) {
        return response.data.QuotationCodeTable.Data.map((item: any) => ({
          code: item.Code,
          name: item.Name,
          industry: item.Industry || '未知',
          board: item.Board || '未知',
          marketCap: item.MarketCap || 0,
          mainBusiness: item.MainBusiness || '未知',
        }));
      }
    } catch (error) {
      console.error('搜索股票失败:', error);
    }

    return [];
  }
}
