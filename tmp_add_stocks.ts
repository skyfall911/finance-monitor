import { StockPoolManager } from './src/stockPool';

async function main() {
  const sp = new StockPoolManager('./data', 200);

  // Well-known A-share stocks matching today's hot themes
  const newStocks = [
    { code: '300750', name: '宁德时代', industry: '新能源', board: '创业板', marketCap: 8500, mainBusiness: '动力电池系统' },
    { code: '002594', name: '比亚迪', industry: '新能源', board: '中小板', marketCap: 6200, mainBusiness: '新能源汽车' },
    { code: '688041', name: '海光信息', industry: '半导体', board: '科创板', marketCap: 1200, mainBusiness: '高端处理器' },
    { code: '300059', name: '东方财富', industry: '金融', board: '创业板', marketCap: 2800, mainBusiness: '互联网券商' },
    { code: '002415', name: '海康威视', industry: '科技', board: '中小板', marketCap: 3200, mainBusiness: '安防产品' },
    { code: '600585', name: '光伏ETF', industry: '新能源', board: '主板', marketCap: 180, mainBusiness: '光伏产业ETF' },
    { code: '600036', name: '招商银行', industry: '金融', board: '主板', marketCap: 9500, mainBusiness: '商业银行' },
    { code: '300274', name: '阳光电源', industry: '新能源', board: '创业板', marketCap: 1350, mainBusiness: '光伏逆变器' },
    { code: '688012', name: '中微公司', industry: '半导体', board: '科创板', marketCap: 950, mainBusiness: '半导体设备' },
    { code: '301786', name: '储能ETF', industry: '新能源', board: 'ETF', marketCap: 85, mainBusiness: '储能产业ETF' },
  ];

  const added: string[] = [];
  for (const stock of newStocks) {
    const result = await sp.addStock({
      code: stock.code,
      name: stock.name,
      industry: stock.industry,
      board: stock.board,
      marketCap: stock.marketCap,
      mainBusiness: stock.mainBusiness,
    });
    console.log(result.message);
    if (result.success) added.push(`${stock.name}(${stock.code})`);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n=== 已添加股票 ===');
  console.log(added.join(', '));

  console.log('\n=== 当前股票池 ===');
  const pool = sp.getPoolData();
  console.log(`总数: ${pool.stocks.length}/${200}`);
  console.log('TOP10:');
  pool.stocks.slice(0, 10).forEach((s, i) => {
    console.log(`${i+1}. ${s.code} ${s.name} ${s.industry} 总分${s.totalScore}`);
  });
}

main().catch(console.error);