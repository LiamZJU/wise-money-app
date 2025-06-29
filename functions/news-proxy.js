async function fetchCailianData(type = 'latest') {
    // 根据类型获取不同的财联社数据
    let apiEndpoints = [];
    
    if (type === 'latest') {
      // 最新电报端点 - 使用最基础的可靠端点
      apiEndpoints = [
        `https://www.cls.cn/nodeapi/telegraphs?refresh_type=1&rn=10&last_time=0`,
        `https://api.cls.cn/nodeapi/telegraphs?refresh_type=1&rn=10&last_time=0`,
        `https://www.cls.cn/telegraph/api/roll_news?refresh_type=1&rn=10&last_time=0`
      ];
    } else {
      // 热门电报端点 - 使用热门专用API
      apiEndpoints = [
        `https://www.cls.cn/nodeapi/hottelegraphs?rn=10`,
        `https://api.cls.cn/nodeapi/hottelegraphs?rn=10`,
        `https://www.cls.cn/nodeapi/telegraphs?refresh_type=2&rn=10&last_time=0`
      ];
    }
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.cls.cn/telegraph',
      'Origin': 'https://www.cls.cn',
      'X-Requested-With': 'XMLHttpRequest'
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
        console.log(`财联社${type}API成功: ${url}`, JSON.stringify(data).substring(0, 300));
        
        // 检查不同的数据结构
        let articles = null;
        
        // 检查标准格式
        if (data.data && data.data.roll_data) {
          articles = data.data.roll_data;
        }
        // 检查直接数组格式
        else if (data.data && Array.isArray(data.data)) {
          articles = data.data;
        }
        // 检查其他可能的格式
        else if (Array.isArray(data)) {
          articles = data;
        }
        else if (data.items) {
          articles = data.items;
        }
        
        if (!articles || articles.length === 0) {
          console.log(`API返回数据为空或结构不正确: ${JSON.stringify(data).substring(0, 500)}`);
          throw new Error('API返回数据结构不正确或为空');
        }
        
        console.log(`找到${articles.length}条原始数据`);
        
        // 过滤并处理数据，但不要过于严格
        const validArticles = articles.filter(item => {
          const content = item.content || item.title || item.brief || '';
          return content && content.trim().length > 5; // 至少5个字符
        }).slice(0, 10);
        
        console.log(`过滤后有效数据${validArticles.length}条`);
        
        if (validArticles.length === 0) {
          throw new Error('过滤后没有有效数据');
        }
        
        return validArticles.map(item => ({
          id: `cl_${item.id || item.newsId || Math.random()}`,
          time: formatTime(item.ctime || item.time || item.createTime),
          content: (item.content || item.title || item.brief || '').trim(),
          url: `https://www.cls.cn/detail/${item.id || item.newsId || ''}`,
          readCount: item.read_count || item.readCount || item.readNum || 0
        }));
        
      } catch (error) {
        console.error(`财联社${type}API失败 ${url}:`, error.message);
        lastError = error;
        continue;
      }
    }
    
    // 如果所有API都失败，返回空数据而不是抛出错误
    console.error(`所有财联社${type}API端点都失败，返回空数据`, lastError?.message);
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
      // 最新快讯端点 - 按时间排序
      apiEndpoints = [
        'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global&client=pc&limit=10&order=time',
        'https://wallstreetcn.com/apiv1/content/lives?channel=global&client=pc&limit=10&order=time',
        'https://api.wallstreetcn.com/apiv1/content/lives?channel=global&client=pc&limit=10&order=time'
      ];
    } else {
      // 重要快讯端点 - 完全不同的参数以获取不同数据
      apiEndpoints = [
        'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global&client=pc&limit=20&importance=3', // 获取更多数据再筛选
        'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global&client=pc&limit=20&level=3',
        'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global&client=pc&limit=20' // 备用：获取更多数据然后手动筛选
      ];
    }
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
        console.log(`华尔街见闻${type}获取到${articles.length}条原始数据`);
        
        // 如果是hottest类型，进行严格的重要性筛选
        let filteredArticles = articles;
        if (type === 'hottest') {
          // 更严格的重要性筛选
          const importantArticles = articles.filter(item => {
            // 检查多种重要性标识
            const hasImportanceFlag = 
              item.importance > 0 || 
              item.level === 'important' || 
              item.is_important === true ||
              item.priority === 'high' ||
              item.urgent === true;
            
            // 检查内容关键词
            const contentText = item.content_text || '';
            const hasImportantKeywords = 
              contentText.includes('重要') || 
              contentText.includes('紧急') ||
              contentText.includes('突发') ||
              contentText.includes('重磅') ||
              contentText.includes('关注') ||
              contentText.includes('重大');
            
            return hasImportanceFlag || hasImportantKeywords;
          });
          
          console.log(`华尔街见闻重要性筛选：原始${articles.length}条，筛选后${importantArticles.length}条`);
          
          // 如果筛选后有足够的数据，使用筛选后的；否则取前10条但标记重要性
          if (importantArticles.length >= 5) {
            filteredArticles = importantArticles;
          } else {
            // 如果重要消息太少，从所有消息中选择相对重要的
            filteredArticles = articles.sort((a, b) => {
              const scoreA = (a.importance || 0) + (a.content_text?.includes('重要') ? 1 : 0);
              const scoreB = (b.importance || 0) + (b.content_text?.includes('重要') ? 1 : 0);
              return scoreB - scoreA;
            });
          }
        }
        
        // 限制返回10条数据
        const result = filteredArticles.slice(0, 10).map(item => ({
          id: `wscn_${item.id}`,
          time: formatWallstreetcnTime(item.display_time),
          content: item.content_text || item.title || '无内容',
          url: item.uri || `https://wallstreetcn.com/articles/${item.id}`,
          importance: item.importance || (item.level === 'important' ? 1 : 0) || 0
        }));
        
        console.log(`华尔街见闻${type}最终返回${result.length}条数据`);
        return result;
        
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

  // 统一的时间格式化函数
  function formatTime(timestamp) {
    try {
      if (!timestamp) {
        return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      
      let date;
      if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else {
        // 如果是秒级时间戳，转换为毫秒
        const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
        date = new Date(ts);
      }
      
      if (isNaN(date.getTime())) {
        return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (error) {
      console.error('时间格式化错误:', error);
      return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  }

  // 华尔街见闻专用时间格式化函数
  function formatWallstreetcnTime(timestamp) {
    try {
      if (!timestamp) {
        return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      
      // 华尔街见闻通常使用秒级时间戳
      const date = new Date(timestamp * 1000);
      
      if (isNaN(date.getTime())) {
        return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      
      // 使用中文时间格式，与官网保持一致
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (error) {
      console.error('华尔街见闻时间格式化错误:', error);
      return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
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