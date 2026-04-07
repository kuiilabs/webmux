# CDP Proxy API 参考

## 基础 URL

```
http://localhost:3456
```

## 端点列表

### 列出所有 tab

```bash
curl -s http://localhost:3456/targets
```

返回：
```json
[
  {
    "targetId": "xxx",
    "title": "页面标题",
    "url": "https://...",
    "type": "page"
  }
]
```

---

### 新建 tab

```bash
curl -s "http://localhost:3456/new?url=https://example.com"
```

可选参数：
- `waitUntil`: `load` | `domcontentloaded` | `networkidle`

返回：
```json
{
  "targetId": "xxx",
  "title": "页面标题"
}
```

---

### 获取 tab 信息

```bash
curl -s "http://localhost:3456/info?target=TARGET_ID"
```

---

### 执行 JavaScript

```bash
curl -s -X POST "http://localhost:3456/eval?target=TARGET_ID" \
  -d 'document.title'
```

返回：JS 执行结果（JSON 序列化）

---

### 点击元素（JS click）

```bash
curl -s -X POST "http://localhost:3456/click?target=TARGET_ID" \
  -d 'button.submit'
```

Body：CSS 选择器

---

### 点击元素（真实鼠标事件）

```bash
curl -s -X POST "http://localhost:3456/clickAt?target=TARGET_ID" \
  -d '.upload-btn'
```

Body：CSS 选择器

---

### 文件上传

```bash
curl -s -X POST "http://localhost:3456/setFiles?target=TARGET_ID" \
  -d '{"selector":"input[type=file]","files":["/path/to/file.png"]}'
```

---

### 截图

```bash
curl -s "http://localhost:3456/screenshot?target=TARGET_ID&file=/tmp/shot.png"
```

---

### 导航到新 URL

```bash
curl -s "http://localhost:3456/navigate?target=TARGET_ID&url=https://..."
```

---

### 后退

```bash
curl -s "http://localhost:3456/back?target=TARGET_ID"
```

---

### 滚动

```bash
# 滚动到指定 Y 坐标
curl -s "http://localhost:3456/scroll?target=TARGET_ID&y=3000"

# 滚动到底部
curl -s "http://localhost:3456/scroll?target=TARGET_ID&direction=bottom"
```

---

### 关闭 tab

```bash
curl -s "http://localhost:3456/close?target=TARGET_ID"
```

---

## 错误处理

| 状态码 | 含义 |
|-------|------|
| 200 | 成功 |
| 400 | 参数错误 |
| 404 | target 不存在 |
| 500 | 执行错误 |
| 503 | Proxy 未就绪 |
