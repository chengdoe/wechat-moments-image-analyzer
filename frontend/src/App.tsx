import { useCallback, useEffect, useRef, useState } from 'react';
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

type IconName =
  | 'personality'
  | 'interests'
  | 'lifestyle'
  | 'values'
  | 'emotion'
  | 'suggestions'
  | 'topics'
  | 'openings'
  | 'dating'
  | 'warnings'
  | 'strategy'
  | 'places'
  | 'activities'
  | 'raw';

const MAX_SIZE_MB = 5;
const MIN_COUNT = 5;
const MAX_ORIGINAL_SIZE_MB = 30;
const TARGET_ANALYZE_SIZE_KB = 350;
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

const TitleIcon = ({ name }: { name: IconName }) => {
  const common = {
    viewBox: '0 0 24 24',
    width: 14,
    height: 14,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'personality':
      return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 19c1.6-3 4.2-4.5 7-4.5s5.4 1.5 7 4.5" /></svg>;
    case 'interests':
      return <svg {...common}><path d="M12 20s-6.5-3.6-8.5-7.2C2 10 3 7 5.8 6.3c2-.5 3.6.4 4.7 1.9 1.1-1.5 2.7-2.4 4.7-1.9C18 7 19 10 17.5 12.8 15.5 16.4 12 20 12 20z" /></svg>;
    case 'lifestyle':
      return <svg {...common}><path d="M3.8 12.2l3.6-3.6 3.2 3.2 5.7-5.7" /><path d="M16.3 6.1H20v3.7" /></svg>;
    case 'values':
      return <svg {...common}><path d="M12 3l7 3.5V12c0 5-3.2 7.9-7 9-3.8-1.1-7-4-7-9V6.5L12 3z" /></svg>;
    case 'emotion':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" /></svg>;
    case 'suggestions':
      return <svg {...common}><path d="M5 17h14M7 13h10M9 9h6" /><path d="M12 3v3" /></svg>;
    case 'topics':
      return <svg {...common}><path d="M4 6h16v10H8l-4 4V6z" /></svg>;
    case 'openings':
      return <svg {...common}><path d="M4 11h12" /><path d="M12 7l4 4-4 4" /><path d="M4 6h16v10H4z" /></svg>;
    case 'dating':
      return <svg {...common}><path d="M12 20s-6.5-3.6-8.5-7.2C2 10 3 7 5.8 6.3c2-.5 3.6.4 4.7 1.9 1.1-1.5 2.7-2.4 4.7-1.9C18 7 19 10 17.5 12.8 15.5 16.4 12 20 12 20z" /></svg>;
    case 'warnings':
      return <svg {...common}><path d="M12 3l9 16H3L12 3z" /><path d="M12 9v4M12 16h.01" /></svg>;
    case 'strategy':
      return <svg {...common}><path d="M4 12h16M12 4l8 8-8 8" /></svg>;
    case 'places':
      return <svg {...common}><path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" /><circle cx="12" cy="11" r="2.3" /></svg>;
    case 'activities':
      return <svg {...common}><circle cx="12" cy="6" r="2.2" /><path d="M8 21l1.5-6L7 12l3-2.5 2 2 2-2 3 2.5-2.5 3 1.5 6" /></svg>;
    case 'raw':
      return <svg {...common}><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v3h3M9 11h6M9 15h6" /></svg>;
    default:
      return null;
  }
};

const SectionTitle = ({
  level = 'h3',
  icon,
  children,
}: {
  level?: 'h3' | 'h4';
  icon: IconName;
  children: React.ReactNode;
}) => {
  const className =
    level === 'h3' ? 'card-title-row card-title-row-main' : 'card-title-row card-title-row-sub';
  if (level === 'h4') {
    return (
      <h4 className={className}>
        <span className="card-title-icon"><TitleIcon name={icon} /></span>
        <span>{children}</span>
      </h4>
    );
  }
  return (
    <h3 className={className}>
      <span className="card-title-icon"><TitleIcon name={icon} /></span>
      <span>{children}</span>
    </h3>
  );
};

const TechTypingLine = ({
  text,
  stepMs = 95,
  pauseMs = 1500,
  className = '',
}: {
  text: string;
  stepMs?: number;
  pauseMs?: number;
  className?: string;
}) => {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let timer: number;
    if (visibleCount < text.length) {
      timer = window.setTimeout(() => {
        setVisibleCount((prev) => prev + 1);
      }, stepMs);
    } else {
      timer = window.setTimeout(() => {
        setVisibleCount(0);
      }, pauseMs);
    }
    return () => window.clearTimeout(timer);
  }, [pauseMs, stepMs, text.length, visibleCount]);

  const shown = text.slice(0, visibleCount);
  const preview = visibleCount < text.length ? text[visibleCount] : '';

  return (
    <div className={`tech-typing-line ${className}`.trim()} aria-label={text}>
      <span className="tech-typing-shown">{shown}</span>
      {preview ? <span className="tech-typing-preview">{preview}</span> : null}
    </div>
  );
};

function App() {
  const [images, setImages] = useState<LocalImage[]>([]);
  const [showAllImages, setShowAllImages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [analyzeGlow, setAnalyzeGlow] = useState(false);
  const uploadAreaRef = useRef<HTMLDivElement | null>(null);
  const analyzeButtonRef = useRef<HTMLDivElement | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const PREVIEW_COLUMNS = 6;
  const PREVIEW_ROWS = 3;
  const MAX_PREVIEW_COUNT = PREVIEW_COLUMNS * PREVIEW_ROWS;

  const scrollToElement = (element: HTMLElement | null) => {
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const triggerUploadAreaFlash = () => {
    const area = uploadAreaRef.current;
    if (!area) return;
    area.classList.remove('upload-area-flash');
    // 强制重绘，确保重复点击时动画可重播
    void area.offsetWidth;
    area.classList.add('upload-area-flash');
    window.setTimeout(() => {
      area.classList.remove('upload-area-flash');
    }, 1300);
  };

  const jumpToUpload = () => {
    scrollToElement(uploadAreaRef.current);
    triggerUploadAreaFlash();
  };

  const triggerAnalyzeButtonGlow = () => {
    setAnalyzeGlow(false);
    window.setTimeout(() => {
      setAnalyzeGlow(true);
      window.setTimeout(() => setAnalyzeGlow(false), 1800);
    }, 30);
  };

  const handleReportNavClick = () => {
    if (loading) {
      Toast.show({ content: '报告正在生成中，请稍等～' });
      return;
    }
    if (result || rawText) {
      scrollToElement(reportRef.current);
      return;
    }
    if (images.length === 0) {
      jumpToUpload();
      return;
    }
    scrollToElement(analyzeButtonRef.current);
    triggerAnalyzeButtonGlow();
  };

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
      if (sizeMB > MAX_ORIGINAL_SIZE_MB) {
        Toast.show({
          content: `单张原图不能超过${MAX_ORIGINAL_SIZE_MB}MB`,
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

    if (newImages.some((img) => img.sizeMB > MAX_SIZE_MB)) {
      Toast.show({
        content: `检测到大图，分析前会自动压缩到${MAX_SIZE_MB}MB以内`,
      });
    }

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

  const fileOrBlobToDataUrl = (file: File | Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const estimateDataUrlBytes = (dataUrl: string): number => {
    const base64 = dataUrl.split(',')[1] || '';
    return Math.ceil((base64.length * 3) / 4);
  };

  const compressOnce = (
    file: File | Blob,
    options: { quality: number; maxWidth: number; maxHeight: number }
  ): Promise<File | Blob> =>
    new Promise((resolve, reject) => {
      // @ts-ignore
      new Compressor(file, {
        quality: options.quality,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        convertSize: 0,
        success(result: File | Blob) {
          resolve(result);
        },
        error(err: Error) {
          reject(err);
        },
      });
    });

  const compressToDataUrl = async (
    file: File,
    maxBytes: number
  ): Promise<string> => {
    let current: File | Blob = file;
    let quality = 0.82;
    let maxWidth = 1800;
    let maxHeight = 1800;
    let bestDataUrl = await fileOrBlobToDataUrl(file);
    let bestBytes = estimateDataUrlBytes(bestDataUrl);

    for (let i = 0; i < 8; i += 1) {
      current = await compressOnce(current, { quality, maxWidth, maxHeight });
      const dataUrl = await fileOrBlobToDataUrl(current);
      const bytes = estimateDataUrlBytes(dataUrl);
      if (bytes < bestBytes) {
        bestBytes = bytes;
        bestDataUrl = dataUrl;
      }
      if (bytes <= maxBytes) {
        return dataUrl;
      }
      quality = Math.max(0.28, quality - 0.1);
      maxWidth = Math.max(520, Math.round(maxWidth * 0.82));
      maxHeight = Math.max(520, Math.round(maxHeight * 0.82));
    }

    return bestDataUrl;
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
      const targetBytes = Math.min(
        MAX_SIZE_MB * 1024 * 1024,
        TARGET_ANALYZE_SIZE_KB * 1024
      );
      const dataUrls: string[] = [];
      for (const img of selected) {
        const compressed = await compressToDataUrl(img.file, targetBytes);
        dataUrls.push(compressed);
      }

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

  const buildReportMarkdown = () => {
    const lines: string[] = [];
    lines.push('# 朋友圈分析报告');
    lines.push('');
    lines.push(`- 生成时间：${new Date().toLocaleString()}`);
    lines.push('');

    if (result?.personality) {
      lines.push('## 人物画像');
      if (result.personality.tags?.length) {
        lines.push(`- 标签：${result.personality.tags.join('、')}`);
      }
      if (result.personality.description) {
        lines.push('');
        lines.push(result.personality.description);
      }
      lines.push('');
    }

    if (result?.interests?.length) {
      lines.push('## 兴趣爱好');
      result.interests.forEach((it) => {
        lines.push(`- **${it.name}**（${it.level}）`);
        if (it.description) lines.push(`  - ${it.description}`);
      });
      lines.push('');
    }

    if (result?.lifestyle) {
      lines.push('## 生活方式');
      if (result.lifestyle.habits?.length) {
        lines.push(`- 习惯：${result.lifestyle.habits.join('、')}`);
      }
      if (result.lifestyle.description) {
        lines.push('');
        lines.push(result.lifestyle.description);
      }
      lines.push('');
    }

    if (result?.values) {
      lines.push('## 价值观分析');
      if (result.values.career) lines.push(`- 事业观：${result.values.career}`);
      if (result.values.relationship) lines.push(`- 感情观：${result.values.relationship}`);
      if (result.values.family) lines.push(`- 家庭观：${result.values.family}`);
      if (result.values.life) lines.push(`- 人生观：${result.values.life}`);
      lines.push('');
    }

    if (result?.emotion) {
      lines.push('## 情绪状态');
      if (result.emotion.state) lines.push(`- 状态：${result.emotion.state}`);
      if (result.emotion.description) {
        lines.push('');
        lines.push(result.emotion.description);
      }
      lines.push('');
    }

    if (result?.suggestions) {
      lines.push('## 交友建议');
      if (result.suggestions.topics?.length) {
        lines.push('### 聊天话题推荐');
        result.suggestions.topics.forEach((t) => lines.push(`- ${t}`));
        lines.push('');
      }
      if (result.suggestions.openings?.length) {
        lines.push('### 开场白建议');
        result.suggestions.openings.forEach((o) => lines.push(`- ${o}`));
        lines.push('');
      }
      if (
        result.suggestions.dating &&
        (result.suggestions.dating.places?.length ||
          result.suggestions.dating.activities?.length)
      ) {
        lines.push('### 约会建议');
        if (result.suggestions.dating.places?.length) {
          lines.push('- 地点');
          result.suggestions.dating.places.forEach((p) => lines.push(`  - ${p}`));
        }
        if (result.suggestions.dating.activities?.length) {
          lines.push('- 活动');
          result.suggestions.dating.activities.forEach((a) => lines.push(`  - ${a}`));
        }
        lines.push('');
      }
      if (result.suggestions.warnings?.length) {
        lines.push('### 注意事项');
        result.suggestions.warnings.forEach((w) => lines.push(`- ${w}`));
        lines.push('');
      }
      if (result.suggestions.strategy?.length) {
        lines.push('### 互动策略');
        result.suggestions.strategy.forEach((s) => lines.push(`- ${s}`));
        lines.push('');
      }
    }

    if (rawText) {
      lines.push('## 原始文本结果');
      lines.push('');
      lines.push(rawText);
      lines.push('');
    }

    return lines.join('\n').trim();
  };

  const handleDownloadReport = () => {
    if (!result && !rawText) {
      Toast.show({ content: '当前暂无可下载报告' });
      return;
    }
    const markdown = buildReportMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const time = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `朋友圈分析报告-${time}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Toast.show({ content: '已下载完成' });
  };

  const visibleImages = showAllImages
    ? images
    : images.slice(0, MAX_PREVIEW_COUNT);
  const hasMoreThanThreeRows = images.length > MAX_PREVIEW_COUNT;

  return (
    <div className="app-root">
      <div className="app-shell">
        <div className="top-nav">
          <div className="top-nav-brand">
            <div className="brand-logo" aria-hidden="true">
              <div className="brand-logo-chat">
                <span className="brand-logo-chat-avatar" />
                <span className="brand-logo-chat-line brand-logo-chat-line-top" />
                <span className="brand-logo-chat-line brand-logo-chat-line-bottom" />
              </div>
              <div className="brand-logo-chart">
                <span className="brand-logo-bar brand-logo-bar-1" />
                <span className="brand-logo-bar brand-logo-bar-2" />
                <span className="brand-logo-bar brand-logo-bar-3" />
                <span className="brand-logo-arrow" />
              </div>
            </div>
            <span>Moments AI</span>
          </div>
          <div className="top-nav-links">
            <button
              type="button"
              className="top-nav-link-button"
              onClick={jumpToUpload}
            >
              上传图片
            </button>
            <button
              type="button"
              className="top-nav-link-button"
              onClick={handleReportNavClick}
            >
              分析报告
            </button>
          </div>
        </div>

        <div className="hero-card">
          <div className="hero-header" id="upload">
            <h1 className="hero-title">朋友圈分析助手</h1>
            <p className="hero-subtitle">
              <TechTypingLine
                className="hero-subtitle-typing"
                text="上传朋友圈截图，AI 帮你快速分析画像、兴趣和聊天建议"
                stepMs={85}
                pauseMs={1300}
              />
            </p>
          </div>

          <div
            ref={uploadAreaRef}
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
            请上传 5 张以上的朋友圈截图；支持大图，分析前会自动压缩到单张 {MAX_SIZE_MB}MB 以内。
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

          <div className="hero-footer" ref={analyzeButtonRef}>
            {result || rawText ? (
              <div className="analyze-actions">
                <Button
                  color="primary"
                  size="large"
                  className="analyze-button"
                  onClick={handleAnalyze}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading-inline">
                      <SpinLoading style={{ '--size': '24px' }} /> 正在为你生成结果，约 30 秒完成，请稍等
                    </span>
                  ) : (
                    '重新分析'
                  )}
                </Button>
                <Button
                  color="default"
                  size="large"
                  className="analyze-button analyze-button-secondary"
                  onClick={handleDownloadReport}
                  disabled={loading}
                >
                  下载报告
                </Button>
              </div>
            ) : (
              <Button
                id="analyze"
                color="primary"
                size="large"
                className={`analyze-button ${analyzeGlow ? 'analyze-button-glow' : ''}`}
                onClick={handleAnalyze}
                disabled={loading}
              >
                {loading ? (
                  <span className="loading-inline">
                    <SpinLoading style={{ '--size': '24px' }} /> 正在为你生成结果，约 30 秒完成，请稍等
                  </span>
                ) : (
                  '开始分析'
                )}
              </Button>
            )}
          </div>
        </div>

        {(result || rawText) && (
          <div className="result-card" id="report" ref={reportRef}>
            <h2 className="section-title">分析报告</h2>
            <div className="report-waterfall">
              {result && result.personality && (
                <div className="card-block">
                  <SectionTitle icon="personality">人物画像</SectionTitle>
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
                  <SectionTitle icon="interests">兴趣爱好</SectionTitle>
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
                  <SectionTitle icon="lifestyle">生活方式</SectionTitle>
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
                  <SectionTitle icon="values">价值观分析</SectionTitle>
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
                  <SectionTitle icon="emotion">情绪状态</SectionTitle>
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
                  <SectionTitle icon="suggestions">交友建议</SectionTitle>

                  {result.suggestions.topics && (
                    <>
                      <h4 className="card-subtitle">聊天话题推荐</h4>
                      <ul className="bullet-list">
                        {result.suggestions.topics.map((t, idx) => (
                          <li key={`${t}-${idx}`}>{t}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  {result.suggestions.openings && (
                    <>
                      <h4 className="card-subtitle">开场白建议</h4>
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
                        <h4 className="card-subtitle">约会建议</h4>
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
                      <h4 className="card-subtitle">注意事项</h4>
                      <ul className="bullet-list">
                        {result.suggestions.warnings.map((w, idx) => (
                          <li key={`${w}-${idx}`}>{w}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  {result.suggestions.strategy && (
                    <>
                      <h4 className="card-subtitle">互动策略</h4>
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
                  <SectionTitle icon="raw">原始文本结果</SectionTitle>
                  <p className="card-text">
                    模型没有严格按 JSON 输出，我先把原文展示出来，方便你查看。
                  </p>
                  <pre className="raw-text-block">{rawText}</pre>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;

