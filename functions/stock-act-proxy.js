// Mock data simulating a database of congressional trades.
const MOCK_TRADE_DATA = {
    "PELOSI, NANCY": [
      {
        "transaction_date": "2024-05-24",
        "ticker": "NVDA",
        "asset_description": "NVIDIA Corporation - Call Options",
        "transaction_type": "Purchase",
        "amount_range": "$1,000,001 - $5,000,000"
      },
      {
        "transaction_date": "2024-05-15",
        "ticker": "MSFT",
        "asset_description": "Microsoft Corporation",
        "transaction_type": "Purchase",
        "amount_range": "$250,001 - $500,000"
      },
      {
        "transaction_date": "2024-04-30",
        "ticker": "GOOGL",
        "asset_description": "Alphabet Inc. Class A",
        "transaction_type": "Sale",
        "amount_range": "$500,001 - $1,000,000"
      }
    ]
  };
  
  export async function onRequest(context) {
    const { searchParams } = new URL(context.request.url);
    const filer = searchParams.get('filer');
  
    if (!filer) {
      return new Response(JSON.stringify({ error: 'Filer name is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  
    try {
      const trades = MOCK_TRADE_DATA[filer.toUpperCase()];
  
      if (trades) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
        return new Response(JSON.stringify(trades), { 
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=3600' } 
        });
      } else {
        return new Response(JSON.stringify({ error: 'No data found for this filer' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error) {
      console.error('STOCK Act Proxy Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }  