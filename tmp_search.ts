import { StockPoolManager } from './src/stockPool';

async function main() {
  const sp = new StockPoolManager('./data', 200);

  // Search for stocks matching news themes
  const keywords = ['新能源车', '芯片半导体', 'AI人工智能', '光伏太阳能', '储能', '创新药', '5G通信设备', '银行', '军工', '券商'];

  const allResults: any[] = [];
  for (const kw of keywords) {
    try {
      const results = await sp.searchStocks(kw);
      allResults.push(...results);
      console.error(`搜索「${kw}」: 找到 ${results.length} 支`);
      await new Promise(r => setTimeout(r, 500));
    } catch (e: any) {
      console.error(`搜索「${kw}」失败:`, e.message);
    }
  }

  // Dedupe by code
  const deduped = allResults.filter((s, i, arr) => arr.findIndex(x => x.code === s.code) === i);
  console.log(JSON.stringify(deduped.slice(0, 20), null, 2));
}

main().catch(console.error);