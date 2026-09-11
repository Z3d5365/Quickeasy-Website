/* =========================================================================
   QuickEasy Software — CloudFront viewer-request function.
   Runtime: cloudfront-js-2.0 (needs async/await and the KeyValueStore API).

   One function, because a cache behavior allows only one per event type and
   only one KVS association. It does four things, in this order:

     1. www.<host> -> <host>, 301. Derived from the Host header rather than
        hardcoded, so the staging alias exercises the identical code path.
     2. Legacy 301s, looked up in the KVS by the RAW request.uri.
     3. Trailing-slash normalisation, 301 (WordPress did this; keep it).
     4. Clean URLs: append index.html. S3-behind-OAC will not do this itself.

   Step 2 deliberately probes BOTH "/old" and "/old/". Every key in the map is
   trailing-slashed, so looking up only request.uri would miss "/apps", fall
   through to step 3, and emit /apps -> /apps/ -> / : a two-hop chain against
   an SEO rule that wants zero. Probing both forms keeps it to one hop.

   Query strings ride along on the host and slash redirects, where the path is
   otherwise unchanged. They are NOT appended to KVS targets, which are explicit
   and may carry a #fragment (the category archives point at /blog/#topic) —
   "/blog/#topic?utm=x" would be malformed.

   SYNTAX: the runtime is ES5.1 with only a subset of newer features. `for...of`
   is rejected outright at publish time, and String#startsWith/endsWith/includes
   are not worth relying on. Everything below sticks to indexed loops and
   indexOf/charAt. async/await is fine — that is what 2.0 adds.
   ========================================================================= */
import cf from 'cloudfront';

var kvs = cf.kvs();

function endsWithSlash(s) {
  return s.charAt(s.length - 1) === '/';
}

// A path segment containing a dot is a file (/assets/css/main.css,
// /sitemap.xml); anything else is a folder-style URL.
function hasExtension(uri) {
  var last = uri.substring(uri.lastIndexOf('/') + 1);
  return last.indexOf('.') !== -1;
}

function queryString(request) {
  var qs = request.querystring;
  var parts = [];
  for (var key in qs) {
    var v = qs[key];
    if (v.multiValue) {
      for (var i = 0; i < v.multiValue.length; i++) {
        parts.push(key + '=' + v.multiValue[i].value);
      }
    } else {
      parts.push(v.value === '' ? key : key + '=' + v.value);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function movedTo(location) {
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: location } }
  };
}

async function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host ? request.headers.host.value : '';

  // 1. Canonical host.
  if (host.indexOf('www.') === 0) {
    return movedTo('https://' + host.substring(4) + uri + queryString(request));
  }

  var folderish = !endsWithSlash(uri) && !hasExtension(uri);

  // 2. Legacy redirect map. Probe the URI as asked for, then its slashed twin.
  //    Percent-encoding is case-insensitive and clients normalise the hex digits to
  //    uppercase, but WordPress published these paths lowercase — so also probe an
  //    uppercase-normalised form rather than relying on the map holding every case.
  var candidates = folderish ? [uri, uri + '/'] : [uri];
  if (uri.indexOf('%') !== -1) {
    var upper = uri.replace(/%[0-9a-f]{2}/g, function (m) { return m.toUpperCase(); });
    if (upper !== uri) {
      candidates.push(upper);
      if (folderish) candidates.push(upper + '/');
    }
  }
  for (var i = 0; i < candidates.length; i++) {
    try {
      var target = await kvs.get(candidates[i]);
      if (target) {
        return movedTo(target);
      }
    } catch (e) {
      // not in the map — keep going
    }
  }

  // 3. Folder URLs get their trailing slash.
  if (folderish) {
    return movedTo(uri + '/' + queryString(request));
  }

  // 4. Clean URL -> the object that actually exists in the bucket.
  if (endsWithSlash(uri)) {
    request.uri = uri + 'index.html';
  }

  return request;
}
