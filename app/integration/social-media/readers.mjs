/*
 * Server-side READ-ONLY provider clients. OAuth/Page tokens must come from a
 * secret store at runtime. Never embed tokens in source, URLs, or client HTML.
 * Caller owns RBAC, rate limits, durable cursors, field-level access and retention.
 */
function id(value, label) {
  const s = String(value || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,160}$/.test(s)) throw new Error('INVALID_' + label);
  return s;
}
function version(value) {
  const s = String(value || 'v26.0');
  if (!/^v[0-9]+\.[0-9]+$/.test(s)) throw new Error('INVALID_GRAPH_VERSION');
  return s;
}
async function readJSON(fetchImpl, url, token) {
  if (!token || String(token).trim().length < 12) throw new Error('PROVIDER_OAUTH_NOT_CONFIGURED');
  const res = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    redirect: 'error'
  });
  if (!res.ok) {
    // Never surface provider request URLs, full error bodies, or credentials.
    const err = new Error('PROVIDER_REQUEST_FAILED_' + String(res.status));
    err.status = res.status;
    err.retryable = [429, 500, 502, 503, 504].includes(res.status);
    throw err;
  }
  return res.json();
}
function urlWith(host, path, params) {
  const url = new URL(path, host);
  for (const [key, value] of Object.entries(params || {})) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

export function createFacebookPageReader({ accessToken, graphVersion = 'v26.0', fetchImpl = fetch } = {}) {
  const base = 'https://graph.facebook.com/' + version(graphVersion) + '/';
  const call = (path, params) => readJSON(fetchImpl, urlWith(base, path, params), accessToken);
  return Object.freeze({
    listPosts(pageId, { after, limit = 100 } = {}) {
      return call(id(pageId, 'PAGE_ID') + '/posts', {
        fields: 'id,message,created_time,permalink_url,attachments{media_type}',
        limit: Math.min(100, Math.max(1, limit)), after
      });
    },
    listVideos(pageId, { after, limit = 100 } = {}) {
      return call(id(pageId, 'PAGE_ID') + '/videos', {
        fields: 'id,title,description,created_time,length,permalink_url',
        limit: Math.min(100, Math.max(1, limit)), after
      });
    },
    listComments(postId, { after, limit = 100 } = {}) {
      return call(id(postId, 'POST_ID') + '/comments', {
        fields: 'id,message,created_time,parent{id},permalink_url',
        limit: Math.min(100, Math.max(1, limit)), after
      });
    },
    getPostInsights(postId, metricNames) {
      if (!Array.isArray(metricNames) || !metricNames.length ||
          !metricNames.every(x => /^[a-z][a-z0-9_]{1,80}$/.test(x))) {
        throw new Error('CURRENT_METRIC_CATALOG_REQUIRED');
      }
      // Callers must load the active version's metric catalog. Legacy
      // post_impressions* metrics were deprecated in 2026.
      if (metricNames.some(x => /^post_impressions/.test(x))) {
        throw new Error('LEGACY_IMPRESSIONS_NOT_SUPPORTED');
      }
      return call(id(postId, 'POST_ID') + '/insights', {
        metric: metricNames.join(',')
      });
    }
  });
}

export function createYoutubeReader({ accessToken, fetchImpl = fetch } = {}) {
  const call = (path, params, analytics = false) => readJSON(
    fetchImpl,
    urlWith(analytics ? 'https://youtubeanalytics.googleapis.com/v2/' : 'https://www.googleapis.com/youtube/v3/', path, params),
    accessToken
  );
  return Object.freeze({
    getMyChannel() {
      return call('channels', {part:'id,snippet,contentDetails', mine:'true'});
    },
    listUploads(uploadsPlaylistId, {pageToken, maxResults = 50} = {}) {
      return call('playlistItems', {
        part:'contentDetails,snippet', playlistId:id(uploadsPlaylistId, 'PLAYLIST_ID'),
        maxResults:Math.min(50,Math.max(1,maxResults)),pageToken
      });
    },
    listVideos(videoIds) {
      if (!Array.isArray(videoIds) || videoIds.length < 1 || videoIds.length > 50) throw new Error('INVALID_VIDEO_ID_COUNT');
      return call('videos', {
        part:'id,snippet,contentDetails,statistics,status',
        id:videoIds.map(x=>id(x,'VIDEO_ID')).join(',')
      });
    },
    listVideoComments(videoId, {pageToken, maxResults = 100} = {}) {
      return call('commentThreads', {
        part:'id,snippet,replies', videoId:id(videoId,'VIDEO_ID'),
        maxResults:Math.min(100,Math.max(1,maxResults)), pageToken,
        textFormat:'plainText', order:'time'
      });
    },
    listCommentReplies(parentId, {pageToken,maxResults=100} = {}) {
      return call('comments', {
        part:'id,snippet', parentId:id(parentId,'PARENT_COMMENT_ID'),
        maxResults:Math.min(100,Math.max(1,maxResults)), pageToken,
        textFormat:'plainText'
      });
    },
    channelDailyAnalytics({startDate,endDate,metrics='views,estimatedMinutesWatched,averageViewDuration',dimensions='day'}) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||startDate>endDate) throw new Error('INVALID_ANALYTICS_DATES');
      const whitelist = new Set(['views','estimatedMinutesWatched','averageViewDuration','likes','comments','shares','subscribersGained']);
      const requested = String(metrics).split(',').map(x=>x.trim());
      if (!requested.length || !requested.every(x=>whitelist.has(x))) throw new Error('INVALID_ANALYTICS_METRICS');
      if (!['day','video'].includes(dimensions)) throw new Error('INVALID_ANALYTICS_DIMENSION');
      return call('reports', {
        ids:'channel==MINE',startDate,endDate,metrics:requested.join(','),dimensions
      },true);
    }
  });
}
