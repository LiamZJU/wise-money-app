async function fetchCailian() {
    const url = 'https://www.cls.cn/nodeapi/telegraphs?refresh_type=1&rn=20&last_time=';
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error('Failed to fetch Cailian data');
    const data = await response.json();
    const articles = data.data.roll_data;
    return articles.map(item => ({
      id: `cl_${item.id}`,
      time: new Date(item.ctime * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      content: item.content,
      url: `https://www.cls.cn/detail/${item.id}`
    }));
  }
  
  async function fetchWallstreetcn() {
    const url = 'https://api-one.wallstreetcn.com/apiv1/content/lives?channel=global&client=pc&limit=20';
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error('Failed to fetch Wallstreetcn data');
    const data = await response.json();
    const articles = data.data.items;
    return articles.map(item => ({
      id: `wscn_${item.id}`,
      time: new Date(item.display_time * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      content: item.content_text,
      url: item.uri
    }));
  }
  
  export async function onRequest(context) {
    const { searchParams } = new URL(context.request.url);
    const platform = searchParams.get('platform');
  
    try {
      let data;
      switch (platform) {
        case 'cailian':
          data = await fetchCailian();
          break;
        case 'wallstreetcn':
          data = await fetchWallstreetcn();
          break;
        default:
          return new Response(JSON.stringify({ error: 'Valid platform parameter is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      
      return new Response(JSON.stringify({ latest: data, hottest: data.slice(0, 5) }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=60, stale-while-revalidate'
        }
      });
    } catch (error) {
      console.error(`News Proxy Error for [${platform}]:`, error);
      return new Response(JSON.stringify({ latest: [], hottest: [], error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }  