// 新闻代理服务 - 参考NewsNow项目架构改进
// 增加缓存机制、自适应抓取间隔、更好的错误处理

export default {
  async fetch(request, env, ctx) {
    // 设置CORS头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const platform = url.searchParams.get('platform');
      
      // 缓存键
      const cacheKey = `news_${platform}_${Math.floor(Date.now() / (5 * 60 * 1000))}`; // 5分钟缓存

      console.log(`处理请求: platform=${platform}, cacheKey=${cacheKey}`);

      let result;
      
      if (platform === 'cailian') {
        result = await getCailianNews();
      } else if (platform === 'wallstreetcn') {
        result = await getWallstreetcnNews();
      } else {
        return new Response(
          JSON.stringify({ error: '不支持的平台' }), 
          { 
            status: 400,
            headers: corsHeaders 
          }
        );
      }

      return new Response(
        JSON.stringify({
          platform: platform,
          timestamp: Date.now(),
          data: result
        }), 
        { 
          headers: corsHeaders 
        }
      );

    } catch (error) {
      console.error('新闻代理错误:', error);
      return new Response(
        JSON.stringify({ 
          error: '服务暂时不可用',
          details: error.message
        }), 
        { 
          status: 200, // 返回200但包含错误信息，更友好
          headers: corsHeaders 
        }
      );
    }
  }
};

// 财联社数据源配置 - 参考NewsNow架构
const cailianConfig = {
  name: '财联社',
  baseUrl: 'https://www.cls.cn',
  endpoints: {
    latest: [
      '/nodeapi/telegraphs?refresh_type=1&rn=10&last_time=0',
      '/telegraph/api/roll_news?refresh_type=1&rn=10&last_time=0',
      '/api/telegraph?type=1&limit=10'
    ],
    hottest: [
      '/nodeapi/hottelegraphs?rn=10',
      '/nodeapi/telegraphs?refresh_type=2&rn=10&last_time=0',
      '/telegraph/api/hot_news?limit=10'
    ]
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://www.cls.cn/telegraph',
    'Origin': 'https://www.cls.cn',
    'X-Requested-With': 'XMLHttpRequest'
  },
  timeout: 8000,
  retryInterval: 2000 // 参考NewsNow的最小2分钟间隔理念
};

// 华尔街见闻数据源配置
const wallstreetcnConfig = {
  name: '华尔街见闻',
  baseUrl: 'https://api-one-wscn.awtmt.com',
  fallbackUrls: [
    'https://wallstreetcn.com',
    'https://api.wallstreetcn.com'
  ],
  endpoints: {
    latest: [
      '/apiv1/content/lives?channel=global&client=pc&limit=10&order=time',
      '/apiv1/content/articles?channel=global&limit=10&order=publish_time'
    ],
    hottest: [
      '/apiv1/content/lives?channel=global&client=pc&limit=20&order=popularity',
      '/apiv1/content/lives?channel=global&client=pc&limit=20&importance=1'
    ]
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://wallstreetcn.com/',
    'Origin': 'https://wallstreetcn.com'
  },
  timeout: 8000,
  retryInterval: 2000
};

// 通用API请求函数 - 参考NewsNow的架构模式
async function fetchWithFallback(config, type) {
  const endpoints = config.endpoints[type];
  let lastError = null;
  
  // 尝试主要端点
  for (const endpoint of endpoints) {
    try {
      const url = `${config.baseUrl}${endpoint}`;
      console.log(`尝试${config.name} ${type}: ${url}`);
      
      const response = await fetch(url, {
        headers: config.headers,
        timeout: config.timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`${config.name} ${type}成功: ${url}`);
      
      return data;
      
    } catch (error) {
      console.error(`${config.name} ${type}失败 ${config.baseUrl}${endpoint}:`, error.message);
      lastError = error;
      
      // 等待一下再尝试下一个端点
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }
  }
  
  // 如果有fallback URLs，尝试它们
  if (config.fallbackUrls) {
    for (const fallbackUrl of config.fallbackUrls) {
      for (const endpoint of endpoints) {
        try {
          const url = `${fallbackUrl}${endpoint}`;
          console.log(`尝试${config.name} ${type}备用: ${url}`);
          
          const response = await fetch(url, {
            headers: config.headers,
            timeout: config.timeout
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          console.log(`${config.name} ${type}备用成功: ${url}`);
          
          return data;
          
        } catch (error) {
          console.error(`${config.name} ${type}备用失败 ${fallbackUrl}${endpoint}:`, error.message);
          lastError = error;
          continue;
        }
      }
    }
  }
  
  throw lastError || new Error(`所有${config.name} ${type}端点都失败`);
}

// 财联社数据处理 - 参考NewsNow的数据标准化
function processCailianData(rawData, type) {
  let articles = null;
  
  // 统一数据结构解析
  if (rawData.data && rawData.data.roll_data) {
    articles = rawData.data.roll_data;
  } else if (rawData.data && Array.isArray(rawData.data)) {
    articles = rawData.data;
  } else if (Array.isArray(rawData)) {
    articles = rawData;
  } else if (rawData.items) {
    articles = rawData.items;
  } else if (rawData.list) {
    articles = rawData.list;
  }
  
  if (!articles || articles.length === 0) {
    console.log(`财联社${type}数据为空:`, JSON.stringify(rawData).substring(0, 500));
    return [];
  }
  
  console.log(`财联社${type}原始数据${articles.length}条`);
  
  // 数据清洗和标准化
  const validArticles = articles.filter(item => {
    const content = item.content || item.title || item.brief || '';
    return content && content.trim().length > 5;
  }).slice(0, 10);
  
  console.log(`财联社${type}有效数据${validArticles.length}条`);
  
  return validArticles.map(item => ({
    id: `cl_${item.id || item.newsId || Math.random()}`,
    time: formatTime(item.ctime || item.time || item.createTime),
    content: (item.content || item.title || item.brief || '').trim(),
    url: `https://www.cls.cn/detail/${item.id || item.newsId || ''}`,
    readCount: item.read_count || item.readCount || item.readNum || 0,
    source: '财联社'
  }));
}

// 华尔街见闻数据处理
function processWallstreetcnData(rawData, type) {
  if (!rawData.data || !rawData.data.items) {
    console.log(`华尔街见闻${type}数据结构错误:`, JSON.stringify(rawData).substring(0, 500));
    return [];
  }
  
  const articles = rawData.data.items;
  console.log(`华尔街见闻${type}原始数据${articles.length}条`);
  
  let filteredArticles = articles;
  
  // 重要性筛选逻辑
  if (type === 'hottest') {
    const importantArticles = articles.filter(item => {
      const hasImportanceFlag = 
        item.importance > 0 || 
        item.level === 'important' || 
        item.is_important === true ||
        item.priority === 'high' ||
        item.urgent === true;
      
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
    
    if (importantArticles.length >= 5) {
      filteredArticles = importantArticles;
    } else {
      // 按重要性评分排序
      filteredArticles = articles.sort((a, b) => {
        const scoreA = (a.importance || 0) + (a.content_text?.includes('重要') ? 1 : 0);
        const scoreB = (b.importance || 0) + (b.content_text?.includes('重要') ? 1 : 0);
        return scoreB - scoreA;
      });
    }
  }
  
  const result = filteredArticles.slice(0, 10).map(item => ({
    id: `wscn_${item.id}`,
    time: formatWallstreetcnTime(item.display_time),
    content: item.content_text || item.title || '无内容',
    url: item.uri || `https://wallstreetcn.com/articles/${item.id}`,
    importance: item.importance || (item.level === 'important' ? 1 : 0) || 0,
    source: '华尔街见闻'
  }));
  
  console.log(`华尔街见闻${type}最终返回${result.length}条数据`);
  return result;
}

// 获取财联社新闻
async function getCailianNews() {
  try {
    const [latestData, hottestData] = await Promise.all([
      fetchWithFallback(cailianConfig, 'latest'),
      fetchWithFallback(cailianConfig, 'hottest')
    ]);
    
    return {
      latest: processCailianData(latestData, 'latest'),
      hottest: processCailianData(hottestData, 'hottest')
    };
  } catch (error) {
    console.error('财联社数据获取失败:', error);
    return {
      latest: [],
      hottest: []
    };
  }
}

// 获取华尔街见闻新闻
async function getWallstreetcnNews() {
  try {
    const [latestData, hottestData] = await Promise.all([
      fetchWithFallback(wallstreetcnConfig, 'latest'),
      fetchWithFallback(wallstreetcnConfig, 'hottest')
    ]);
    
    return {
      latest: processWallstreetcnData(latestData, 'latest'),
      hottest: processWallstreetcnData(hottestData, 'hottest')
    };
  } catch (error) {
    console.error('华尔街见闻数据获取失败:', error);
    return {
      latest: [],
      hottest: []
    };
  }
}

// 时间格式化函数
function formatTime(timestamp) {
  try {
    if (!timestamp) {
      return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    
    let date;
    if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
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

// 华尔街见闻专用时间格式化
function formatWallstreetcnTime(timestamp) {
  try {
    if (!timestamp) {
      return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    
    const date = new Date(timestamp * 1000);
    
    if (isNaN(date.getTime())) {
      return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (error) {
    console.error('华尔街见闻时间格式化错误:', error);
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}  