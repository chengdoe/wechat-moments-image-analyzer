require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(
  express.json({
    limit: '25mb',
  })
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { images } = req.body || {};

    if (!Array.isArray(images) || images.length < 3) {
      return res.status(400).json({
        error: '请至少上传3张图片进行分析',
      });
    }

    const apiKey = (process.env.ARK_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(500).json({
        error: '服务端未配置 ARK_API_KEY',
      });
    }

    // 为了控制请求体积，只取最多前 8 张图
    const limitedImages = images.slice(0, 8);

    const imageContents = limitedImages.map((img) => ({
      type: 'image_url',
      image_url: {
        url: img,
      },
    }));

    const promptText = {
      type: 'text',
      text: `请你综合分析这些朋友圈截图里的内容，先用一段 400-800 字的中文长文，口语化地描述对方的性格、兴趣、生活方式、价值观和情绪，然后再按下面给出的 JSON 结构，输出一个字段齐全的 JSON。最终回复必须是一个合法 JSON，对象结构如下：
{
  "raw_text": "口语化长文分析，400-800 字",
  "structured": {
    "personality": {
      "tags": ["标签1", "标签2"],
      "description": "性格描述"
    },
    "interests": [
      {"name": "兴趣名称", "level": "程度", "description": "描述描述"}
    ],
    "lifestyle": {
      "habits": ["习惯1", "习惯2"],
      "description": "生活方式描述"
    },
    "values": {
      "career": "事业观",
      "relationship": "感情观",
      "family": "家庭观",
      "life": "人生观"
    },
    "emotion": {
      "state": "情绪状态",
      "description": "情绪描述"
    },
    "suggestions": {
      "topics": ["话题1", "话题2"],
      "openings": ["开场白1", "开场白2"],
      "dating": {
        "places": ["地点1", "地点2"],
        "activities": ["活动1", "活动2"]
      },
      "warnings": ["注意事项1", "注意事项2"],
      "strategy": ["阶段1建议", "阶段2建议"]
    }
  }
}
只返回 JSON 本身，不要额外加解释文字、前后缀。`,
    };

    const payload = {
      model: 'doubao-seed-2-0-pro-260215',
      reasoning_effort: 'medium',
      messages: [
        {
          role: 'system',
          content:
            '你是一个追求异性的高手，对于青春男女生的心理和外在表现，有非常强的洞察，也有一套很厉害的追求异性的技巧！擅长于输出简短但有效的分析和建议。',
        },
        {
          role: 'user',
          content: [...imageContents, promptText],
        },
      ],
    };

    // 单次调用：多模态 + 结构化 JSON 一步完成（不设置 axios 超时时间，交给 Ark 自身超时）
    const arkResponse = await axios.post(
      'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const message = arkResponse?.data?.choices?.[0]?.message;
    let contentText = '';

    if (Array.isArray(message?.content)) {
      contentText = message.content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (typeof part?.text === 'string') return part.text;
          if (typeof part?.content === 'string') return part.content;
          return '';
        })
        .filter(Boolean)
        .join('\n');
    } else if (typeof message?.content === 'string') {
      contentText = message.content;
    } else if (message?.content != null) {
      contentText = JSON.stringify(message.content);
    }

    let parsed = null;
    if (contentText) {
      try {
        parsed = JSON.parse(contentText);
      } catch {
        const match = contentText.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {
            parsed = null;
          }
        }
      }
    }

    const rawText =
      parsed?.raw_text && typeof parsed.raw_text === 'string'
        ? parsed.raw_text
        : contentText;
    const structured =
      parsed?.structured && typeof parsed.structured === 'object'
        ? parsed.structured
        : parsed;

    res.json({
      success: true,
      raw: rawText,
      data: structured,
    });
  } catch (error) {
    const arkError = error?.response?.data;
    console.error('调用豆包接口失败', arkError || error.message);
    res.status(500).json({
      error:
        arkError?.error?.message ||
        arkError?.message ||
        `分析失败：${error.message || '未知错误'}`,
    });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Backend server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;

