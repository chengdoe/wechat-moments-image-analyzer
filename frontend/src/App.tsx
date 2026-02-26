import { useCallback, useState } from 'react';
import { Button, Toast, Tag, List, SpinLoading } from 'antd-mobile';
import axios from 'axios';
import Compressor from 'compressorjs';
import './App.css';

type Interest = {
  name: string;
  level: string;
  description: string;
};

type AnalysisResult = {
  personality?: {
    tags?: string[];
    description?: string;
  };
  interests?: Interest[];
  lifestyle?: {
    habits?: string[];
    description?: string;
  };
  values?: {
    career?: string;
    relationship?: string;
    family?: string;
    life?: string;
  };
  emotion?: {
    state?: string;
    description?: string;
  };
  suggestions?: {
    topics?: string[];
    openings?: string[];
    dating?: {
      places?: string[];
      activities?: string[];
    };
    warnings?: string[];
    strategy?: string[];
  };
};

type LocalImage = {
  id: string;
  file: File;
  url: string;
  sizeMB: number;
};

const MAX_SIZE_MB = 5;
const MIN_COUNT = 5;
const API_BASE =
  (import.meta as any).env.VITE_API_BASE || (import.meta as any).env.PROD ? '' : 'http://localhost:3001';

const parseUnknownError = (errorLike: unknown): string | null => {
  if (!errorLike) return null;
  if (typeof errorLike === 'string') return errorLike;
  if (typeof errorLike !== 'object') return String(errorLike);

  const maybeObj = errorLike as Record<string, unknown>;
  const directMessage =
    (typeof maybeObj.message === 'string' && maybeObj.message) ||
    (typeof maybeObj.error === 'string' && maybeObj.error) ||
    (typeof maybeObj.detail === 'string' && maybeObj.detail);
  if (directMessage) return directMessage;

  if (maybeObj.error && typeof maybeObj.error === 'object') {
    const nestedMessage = parseUnknownError(maybeObj.error);
    if (nestedMessage) return nestedMessage;
  }

  try {
    return JSON.stringify(errorLike);
  } catch {
    return null;
  }
};

function App() {
  const [images, setImages] = useState<LocalImage[]>([]);
  const [showAllImages, setShowAllImages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const PREVIEW_COLUMNS = 6;
  const PREVIEW_ROWS = 3;
  const MAX_PREVIEW_COUNT = PREVIEW_COLUMNS * PREVIEW_ROWS;

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const newImages: LocalImage[] = [];

    Array.from(files).forEach((file) => {
      if (!validTypes.includes(file.type)) {
        Toast.show({
          content: '仅支持JPG、PNG、JPEG格式',
        });
        return;
      }
      const sizeMB = file.size / 1024 / 1024;
      if (sizeMB > MAX_SIZE_MB) {
        Toast.show({
          content: `单张图片不能超过${MAX_SIZE_MB}MB`,
        });
        return;
      }
      newImages.push({
        id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
        sizeMB: parseFloat(sizeMB.toFixed(2)),
      });
    });

    if (newImages.length === 0) return;

    setImages((prev) => [...prev, ...newImages]);
    setShowAllImages(false);
    setResult(null);
    setRawText(null);
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const next = prev.filter((img) => img.id !== id);
      if (next.length <= MAX_PREVIEW_COUNT) {
        setShowAllImages(false);
      }
      return next;
    });
  };

  const compressToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // @ts-ignore
      new Compressor(file, {
        quality: 0.6,
        maxWidth: 800,
        maxHeight: 800,
        convertSize: 0,
        success(result: File | Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            resolve(reader.result as string);
          };
          reader.onerror = reject;
          reader.readAsDataURL(result);
        },
        error(err: Error) {
          reject(err);
        },
      });
    });
  };

  const handleAnalyze = async () => {
    if (images.length < MIN_COUNT) {
      Toast.show({
        content: `请至少上传${MIN_COUNT}张图片`,
      });
      if (typeof window !== 'undefined') {
        window.alert(`请至少上传${MIN_COUNT}张图片`);
      }
      return;
    }
    setLoading(true);
    setResult(null);
    setRawText(null);
    try {
      // 为了控制请求体积，最多取前 8 张图进行分析
      const selected = images.slice(0, 8);
      const dataUrls = await Promise.all(
        selected.map((img) => compressToDataUrl(img.file))
      );

      // 前端不再单独设置超时时间，由后端/Ark 控制整体时长
      const resp = await axios.post(`${API_BASE}/api/analyze`, {
        images: dataUrls,
      });

      if (resp.data?.data) {
        setResult(resp.data.data as AnalysisResult);
      } else if (resp.data?.raw) {
        console.log('Ark raw result:', resp.data.raw);
        setRawText(String(resp.data.raw));
        Toast.show({
          content: '已展示模型原始文本结果',
        });
      } else {
        if (typeof window !== 'undefined') {
          window.alert('分析结果格式异常，请稍后重试');
        }
        Toast.show({
          content: '分析结果格式异常，请稍后重试',
        });
      }
    } catch (e: any) {
      const msg = (
        parseUnknownError(e?.response?.data?.error) ||
        parseUnknownError(e?.response?.data) ||
        parseUnknownError(e) ||
        '分析失败，请稍后重试'
      ).trim();
      if (typeof window !== 'undefined') {
        window.alert(msg);
      }
      Toast.show({ content: msg });
    } finally {
      setLoading(false);
    }
  };

  const visibleImages = showAllImages
    ? images
    : images.slice(0, MAX_PREVIEW_COUNT);
  const hasMoreThanThreeRows = images.length > MAX_PREVIEW_COUNT;

  return (
    <div className="app-root">
      <div className="app-shell">
        <div className="hero-card">
          <div className="hero-header">
            <h1 className="hero-title">朋友圈分析助手</h1>
            <p className="hero-subtitle">
              上传对方的朋友圈截图，AI 帮你分析并提供交友建议
            </p>
          </div>

          <div
            className="upload-area"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/jpeg,image/jpg,image/png';
              input.multiple = true;
              input.onchange = () => handleFiles(input.files);
              input.click();
            }}
          >
            <div className="upload-icon" />
            <p className="upload-main-text">拖拽图片到此处，或点击上传</p>
            <p className="upload-sub-text">支持 JPG / PNG / JPEG 格式</p>
          </div>

          <p className="upload-hint">
            请上传 5 张以上的朋友圈截图，单张不超过 {MAX_SIZE_MB}MB。
          </p>

          {images.length > 0 && (
            <>
              <div className="preview-grid">
                {visibleImages.map((img) => (
                  <div key={img.id} className="preview-item">
                    <img src={img.url} alt={img.file.name} />
                    <div className="preview-info">
                      <span className="preview-name">{img.file.name}</span>
                      <span className="preview-size">{img.sizeMB}MB</span>
                    </div>
                    <button
                      className="preview-remove"
                      onClick={() => removeImage(img.id)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
              {hasMoreThanThreeRows && !showAllImages && (
                <button
                  className="preview-toggle-button"
                  onClick={() => setShowAllImages(true)}
                >
                  查看所有图片
                </button>
              )}
              {hasMoreThanThreeRows && showAllImages && (
                <button
                  className="preview-toggle-button"
                  onClick={() => setShowAllImages(false)}
                >
                  收起图片
                </button>
              )}
            </>
          )}

          <div className="hero-footer">
            <Button
              color="primary"
              size="large"
              className="analyze-button"
              onClick={handleAnalyze}
              disabled={loading}
            >
              {loading ? (
                <span className="loading-inline">
                  <SpinLoading style={{ '--size': '24px' }} /> 正在分析，大约需要 10-30 秒...
                </span>
              ) : (
                '开始分析'
              )}
            </Button>
          </div>
        </div>

        {(result || rawText) && (
          <div className="result-card">
            <h2 className="section-title">分析报告</h2>

          {result && result.personality && (
            <div className="card-block">
              <h3>人物画像</h3>
              <div className="tags-row">
                {result.personality.tags?.map((tag) => (
                  <Tag key={tag} color="primary" fill="outline">
                    {tag}
                  </Tag>
                ))}
              </div>
              {result.personality.description && (
                <p className="card-text">{result.personality.description}</p>
              )}
            </div>
          )}

          {result && result.interests && result.interests.length > 0 && (
            <div className="card-block">
              <h3>兴趣爱好</h3>
              <List>
                {result.interests.map((it, idx) => (
                  <List.Item
                    key={`${it.name}-${idx}`}
                    description={it.description}
                    extra={it.level}
                  >
                    {it.name}
                  </List.Item>
                ))}
              </List>
            </div>
          )}

          {result && result.lifestyle && (
            <div className="card-block">
              <h3>生活方式</h3>
              {result.lifestyle.habits && (
                <div className="tags-row">
                  {result.lifestyle.habits.map((h) => (
                    <Tag key={h} color="success" fill="outline">
                      {h}
                    </Tag>
                  ))}
                </div>
              )}
              {result.lifestyle.description && (
                <p className="card-text">{result.lifestyle.description}</p>
              )}
            </div>
          )}

          {result && result.values && (
            <div className="card-block">
              <h3>价值观分析</h3>
              <List>
                {result.values.career && (
                  <List.Item extra={result.values.career}>事业观</List.Item>
                )}
                {result.values.relationship && (
                  <List.Item extra={result.values.relationship}>
                    感情观
                  </List.Item>
                )}
                {result.values.family && (
                  <List.Item extra={result.values.family}>家庭观</List.Item>
                )}
                {result.values.life && (
                  <List.Item extra={result.values.life}>人生观</List.Item>
                )}
              </List>
            </div>
          )}

          {result && result.emotion && (
            <div className="card-block">
              <h3>情绪状态</h3>
              {result.emotion.state && (
                <Tag color="warning" fill="outline">
                  {result.emotion.state}
                </Tag>
              )}
              {result.emotion.description && (
                <p className="card-text">{result.emotion.description}</p>
              )}
            </div>
          )}

          {result && result.suggestions && (
            <div className="card-block">
              <h3>交友建议</h3>

              {result.suggestions.topics && (
                <>
                  <h4>聊天话题推荐</h4>
                  <ul className="bullet-list">
                    {result.suggestions.topics.map((t, idx) => (
                      <li key={`${t}-${idx}`}>{t}</li>
                    ))}
                  </ul>
                </>
              )}

              {result.suggestions.openings && (
                <>
                  <h4>开场白建议</h4>
                  <ul className="bullet-list">
                    {result.suggestions.openings.map((o, idx) => (
                      <li key={`${o}-${idx}`}>{o}</li>
                    ))}
                  </ul>
                </>
              )}

              {result.suggestions.dating &&
                (result.suggestions.dating.places?.length ||
                  result.suggestions.dating.activities?.length) && (
                  <>
                    <h4>约会建议</h4>
                    <div className="two-column">
                      {result.suggestions.dating.places &&
                        result.suggestions.dating.places.length > 0 && (
                          <div>
                            <div className="sub-title">地点</div>
                            <ul className="bullet-list">
                              {result.suggestions.dating.places.map(
                                (p, idx) => (
                                  <li key={`${p}-${idx}`}>{p}</li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                      {result.suggestions.dating.activities &&
                        result.suggestions.dating.activities.length > 0 && (
                          <div>
                            <div className="sub-title">活动</div>
                            <ul className="bullet-list">
                              {result.suggestions.dating.activities.map(
                                (a, idx) => (
                                  <li key={`${a}-${idx}`}>{a}</li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                    </div>
                  </>
                )}

              {result.suggestions.warnings && (
                <>
                  <h4>注意事项</h4>
                  <ul className="bullet-list">
                    {result.suggestions.warnings.map((w, idx) => (
                      <li key={`${w}-${idx}`}>{w}</li>
                    ))}
                  </ul>
                </>
              )}

              {result.suggestions.strategy && (
                <>
                  <h4>互动策略</h4>
                  <ul className="bullet-list">
                    {result.suggestions.strategy.map((s, idx) => (
                      <li key={`${s}-${idx}`}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

            {rawText && (
              <div className="card-block">
                <h3>原始文本结果</h3>
                <p className="card-text">
                  模型没有严格按 JSON 输出，我先把原文展示出来，方便你查看。
                </p>
                <pre className="raw-text-block">{rawText}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

