async function fetchCailianData(type = 'latest') {
    // 根据类型获取不同的财联社数据
    const currentTime = Math.floor(Date.now() / 1000);
    let apiEndpoints = [];
    
    if (type === 'latest') {
      // 最新电报端点
      apiEndpoints = [
        'https://www.cls.cn/nodeapi/telegraphs?refresh_type=1&rn=10&last_time=',
        `https://www.cls.cn/nodeapi/refreshTelegraphList?app=CailianpressWeb&lastTime=${currentTime}&os=web&sv=7.7.5`,
        'https://api.cls.cn/nodeapi/telegraphs?refresh_type=1&rn=10&last_time='
      ];
    } else {
      // 热门电报端点（基于阅读量）
      apiEndpoints = [
        'https://www.cls.cn/nodeapi/telegraphs?refresh_type=2&rn=10&last_time=',
        'https://www.cls.cn/nodeapi/hottelegraphs?rn=10',
        'https://api.cls.cn/nodeapi/telegraphs?refresh_type=2&rn=10&last_time='
      ];
    }
    
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
        console.log(`尝试财联社${type}API: ${url}`);
        const response = await fetch(url, { 
          headers,
          timeout: 10000 // 10秒超时
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`财联社${type}API成功: ${url}`, JSON.stringify(data).substring(0, 200));
        
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
        
        // 限制返回10条数据
        return articles.slice(0, 10).map(item => ({
          id: `cl_${item.id || item.newsId || Math.random()}`,
          time: new Date((item.ctime || item.time || Date.now() / 1000) * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          content: item.content || item.title || item.brief || '无内容',
          url: `https://www.cls.cn/detail/${item.id || item.newsId || ''}`,
          readCount: item.read_count || item.readCount || 0
        }));
        
      } catch (error) {
        console.error(`财联社${type}API失败 ${url}:`, error.message);
        lastError = error;
        continue;
      }
    }
    
    // 如果所有API都失败，返回空数据而不是抛出错误
    console.error(`所有财联社${type}API端点都失败，返回空数据`);
    return [];
  }

  async function fetchCailian() {
    try {
      // 并行获取最新和热门数据
      const [latest, hottest] = await Promise.all([
        fetchCailianData('latest'),
        fetchCailianData('hottest')
      ]);
      
      return {
        latest: latest,
        hottest: hottest
      };
    } catch (error) {
      console.error('财联社数据获取失败:', error);
      return {
        latest: [],
        hottest: []
      };
    }
  }
  
  async function fetchWallstreetcnData(type = 'latest') {
    // 根据类型获取不同的华尔街见闻数据
    let apiEndpoints = [];
    
    if (type === 'latest') {
      // 最新快讯端点
      apiEndpoints = [
        'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global&client=pc&limit=10&order=time',
        'https://wallstreetcn.com/apiv1/content/lives?channel=global&client=pc&limit=10&order=time',
        'https://api.wallstreetcn.com/apiv1/content/lives?channel=global&client=pc&limit=10&order=time'
      ];
    } else {
      // 重要快讯端点
      apiEndpoints = [
        'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global&client=pc&limit=10&order=importance',
        'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global&client=pc&limit=10&importance=1',
        'https://wallstreetcn.com/apiv1/content/lives?channel=global&client=pc&limit=10&order=importance',
        'https://api.wallstreetcn.com/apiv1/content/lives?channel=global&client=pc&limit=10&order=importance'
      ];
    }
    
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
        console.log(`尝试华尔街见闻${type}API: ${url}`);
        const response = await fetch(url, { 
          headers,
          timeout: 10000 // 10秒超时
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`华尔街见闻${type}API成功: ${url}`);
        
        // 检查数据结构
        if (!data.data || !data.data.items) {
          throw new Error('API返回数据结构不正确');
        }
        
        const articles = data.data.items;
        // 限制返回10条数据
        return articles.slice(0, 10).map(item => ({
          id: `wscn_${item.id}`,
          time: new Date(item.display_time * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          content: item.content_text,
          url: item.uri,
          importance: item.importance || 0
        }));
        
      } catch (error) {
        console.error(`华尔街见闻${type}API失败 ${url}:`, error.message);
        lastError = error;
        continue;
      }
    }
    
    // 如果所有API都失败，返回空数据而不是抛出错误
    console.error(`所有华尔街见闻${type}API端点都失败，返回空数据`);
    return [];
  }

  async function fetchWallstreetcn() {
    try {
      // 并行获取最新和重要快讯数据
      const [latest, hottest] = await Promise.all([
        fetchWallstreetcnData('latest'),
        fetchWallstreetcnData('hottest')
      ]);
      
      return {
        latest: latest,
        hottest: hottest
      };
    } catch (error) {
      console.error('华尔街见闻数据获取失败:', error);
      return {
        latest: [],
        hottest: []
      };
    }
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
          return new Response(JSON.stringify({ 
            error: 'Valid platform parameter is required',
            supportedPlatforms: ['cailian', 'wallstreetcn'] 
          }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' } 
          });
      }
      
      // 数据已经包含latest和hottest，直接返回
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=60, stale-while-revalidate',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type'
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
          debug: error.message,
          timestamp: new Date().toISOString()
        }), { 
          status: 200, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        });
      }
      
      return new Response(JSON.stringify({ 
        latest: [], 
        hottest: [], 
        error: error.message,
        timestamp: new Date().toISOString()
      }), { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      });
    }
  }  