async function fetchCailian() {
    // 根据搜索结果，尝试多个财联社API端点
    const currentTime = Math.floor(Date.now() / 1000);
    const apiEndpoints = [
      // 原始API
      'https://www.cls.cn/nodeapi/telegraphs?refresh_type=1&rn=20&last_time=',
      // 基于搜索发现的新API格式
      `https://www.cls.cn/nodeapi/refreshTelegraphList?app=CailianpressWeb&lastTime=${currentTime}&os=web&sv=7.7.5`,
      // 备用端点
      'https://api.cls.cn/nodeapi/telegraphs?refresh_type=1&rn=20&last_time=',
      'https://m.cls.cn/nodeapi/telegraphs?refresh_type=1&rn=20&last_time='
    ];
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.cls.cn/telegraph',
      'Origin': 'https://www.cls.cn',
      'X-Requested-With': 'XMLHttpRequest',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    let lastError = null;
    
    for (const url of apiEndpoints) {
      try {
        console.log(`尝试财联社API: ${url}`);
        const response = await fetch(url, { 
          headers,
          timeout: 10000 // 10秒超时
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`财联社API成功: ${url}`, JSON.stringify(data).substring(0, 200));
        
        // 检查不同的数据结构
        let articles = null;
        
        // 检查标准格式
        if (data.data && data.data.roll_data) {
          articles = data.data.roll_data;
        }
        // 检查新格式（基于搜索发现的结构）
        else if (data.l) {
          // 将对象转换为数组
          articles = Object.values(data.l);
        }
        // 检查其他可能的格式
        else if (Array.isArray(data)) {
          articles = data;
        }
        else if (data.items) {
          articles = data.items;
        }
        
        if (!articles || articles.length === 0) {
          throw new Error('API返回数据结构不正确或为空');
        }
        
        return articles.map(item => ({
          id: `cl_${item.id || item.newsId || Math.random()}`,
          time: new Date((item.ctime || item.time || Date.now() / 1000) * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          content: item.content || item.title || item.brief || '无内容',
          url: `https://www.cls.cn/detail/${item.id || item.newsId || ''}`
        }));
        
      } catch (error) {
        console.error(`财联社API失败 ${url}:`, error.message);
        lastError = error;
        continue;
      }
    }
    
    // 如果所有API都失败，返回空数据而不是抛出错误
    console.error('所有财联社API端点都失败，返回空数据');
    return [];
  }
  
  async function fetchWallstreetcn() {
    // 尝试多个可能的API端点
    const apiEndpoints = [
      'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global&client=pc&limit=20',
      'https://wallstreetcn.com/apiv1/content/lives?channel=global&client=pc&limit=20',
      'https://api.wallstreetcn.com/apiv1/content/lives?channel=global&client=pc&limit=20'
    ];
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://wallstreetcn.com/',
      'Origin': 'https://wallstreetcn.com'
    };
    
    let lastError = null;
    
    for (const url of apiEndpoints) {
      try {
        console.log(`尝试华尔街见闻API: ${url}`);
        const response = await fetch(url, { 
          headers,
          timeout: 10000 // 10秒超时
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`华尔街见闻API成功: ${url}`);
        
        // 检查数据结构
        if (!data.data || !data.data.items) {
          throw new Error('API返回数据结构不正确');
        }
        
        const articles = data.data.items;
        return articles.map(item => ({
          id: `wscn_${item.id}`,
          time: new Date(item.display_time * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          content: item.content_text,
          url: item.uri
        }));
        
      } catch (error) {
        console.error(`华尔街见闻API失败 ${url}:`, error.message);
        lastError = error;
        continue;
      }
    }
    
    // 如果所有API都失败，返回空数据而不是抛出错误
    console.error('所有华尔街见闻API端点都失败，返回空数据');
    return [];
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
      
      // 对于第三方API失败，返回友好的错误信息而不是500错误
      const platformMessages = {
        'wallstreetcn': '华尔街见闻数据暂时不可用',
        'cailian': '财联社数据暂时不可用'
      };
      
      if (platformMessages[platform]) {
        return new Response(JSON.stringify({ 
          latest: [], 
          hottest: [], 
          error: platformMessages[platform],
          debug: error.message 
        }), { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        });
      }
      
      return new Response(JSON.stringify({ 
        latest: [], 
        hottest: [], 
        error: error.message 
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
  }  