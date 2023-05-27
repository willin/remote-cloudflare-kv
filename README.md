# remote-cloudflare-kv

[![npm](https://img.shields.io/npm/v/remote-cloudflare-kv.svg?style=plastic)](https://npmjs.org/package/remote-cloudflare-kv) [![npm](https://img.shields.io/npm/dm/remote-cloudflare-kv.svg?style=plastic)](https://npmjs.org/package/remote-cloudflare-kv) [![npm](https://img.shields.io/npm/dt/remote-cloudflare-kv.svg?style=plastic)](https://npmjs.org/package/remote-cloudflare-kv)

## Setup

```bash
npm install --save remote-cloudflare-kv
# or
yarn add remote-cloudflare-kv
# or
pnpm install --save remote-cloudflare-kv
```

## Useage

### Init

```ts
import CloudflareKV from 'remote-cloudflare-kv';

export const NAMESPACE = new CloudflareKV({
  account_id: process.env.CF_ACCOUNT_ID || '',
  namespace_id: process.env.CF_NAMESPACE_ID || '',
  // use bearer token
  api_token: process.env.CF_API_TOKEN || '',
  // or use email & api key
  api_email: '',
  api_key: ''
});
```

### Writing key-value pairs

To create a new key-value pair, or to update the value for a particular key, call the put method on any namespace you have bound to your script. The basic form of this method looks like this:

```ts
await NAMESPACE.put(key, value);
// void
```

Expiring keys:

```ts
await NAMESPACE.put(key, value, { expiration: secondsSinceEpoch });

await NAMESPACE.put(key, value, { expirationTtl: secondsFromNow });
```

Metadata:

```ts
await NAMESPACE.put(key, value, {
  metadata: { someMetadataKey: 'someMetadataValue' }
});
```

### Get key-value pair

To get the value for a given key, you can call the get method on any namespace you have bound to your script:

```ts
// replace key & type
const result = await NAMESPACE.get('key', { type: 'json' });
console.log(result);
// {"hello": 1}
```

Supported types: `text`, `json`, `arrayBuffer`, `stream`.

Normalises type, ignoring cacheTtl as there is only one "edge location": the user's computer

### Get key-value pair with Metadata

You can get the metadata associated with a key-value pair alongside its value by calling the getWithMetadata method on a namespace you have bound in your script:

```ts
const result = await NAMESPACE.getWithMetadata(key, { type: 'json' });
//  {"value": {"hello": 1}, "metadata": {"someKey": "someVal"}}
```

### Deleting key-value pairs

To delete a key-value pair, call the delete method on any namespace you have bound to your script:

```ts
await NAMESPACE.delete(key);
// void
```

### Listing keys

You can use a list operation to see all of the keys that live in a given namespace.

```ts
const result = await NAMESPACE.list();
console.log(result);
```

More detail:

The list method has this signature (in TypeScript):

```ts
await NAMESPACE.list({ prefix: string, limit: number, cursor: string });
```

The `list` method returns a promise which resolves with an object that looks like this:

```json
{
  "keys": [
    {
      "name": "foo",
      "expiration": 1234,
      "metadata": { "someMetadataKey": "someMetadataValue" }
    }
  ],
  "list_complete": false,
  "cursor": "6Ck1la0VxJ0djhidm1MdX2FyD"
}
```

## Refs

- Runtime API: <https://developers.cloudflare.com/workers/runtime-apis/kv/>
- RESTful API: <https://developers.cloudflare.com/api/operations/workers-kv-namespace-list-namespaces>

## 赞助 Sponsor

如果您对本项目感兴趣，可以通过以下方式支持我：

- 关注我的 Github 账号：[@willin](https://github.com/willin) [![github](https://img.shields.io/github/followers/willin.svg?style=social&label=Followers)](https://github.com/willin)
- 参与 [爱发电](https://afdian.net/@willin) 计划
- 支付宝或微信[扫码打赏](https://user-images.githubusercontent.com/1890238/89126156-0f3eeb80-d516-11ea-9046-5a3a5d59b86b.png)

Donation ways:

- Github: <https://github.com/sponsors/willin>
- Paypal: <https://paypal.me/willinwang>
- Alipay or Wechat Pay: [QRCode](https://user-images.githubusercontent.com/1890238/89126156-0f3eeb80-d516-11ea-9046-5a3a5d59b86b.png)

## 许可证 License

Apache-2.0 &copy; <https://willin.wang>
