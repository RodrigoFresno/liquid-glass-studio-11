import { useMemo, useRef, useState } from 'react';
import { LiquidGlassLogo, type LiquidGlassLogoHandle } from '../components/liquid-glass-logo';
import appIcon from './assets/liquid-glass-studio.png';
import { createLiquidGlassLogoRenderer, liquidGlassLogoDefaults, liquidGlassLogoThemes, normalizeLiquidGlassLogo } from '../components/liquid-glass-logo-renderer';
import { ImagePlus, Download, RotateCcw, Sparkles, Upload, Sun, Moon, Film, Play, Pause, SkipBack, SkipForward } from 'lucide-react';

type Theme = 'light' | 'dark';
const defaults = { logoSize: 256, logoScale: 0.72, finalLogoScale: 1, glassScale: 1, iconScale: 1, logoRelief: 0.79, depth: 1.2, dispersion: 1, relief: 1, caustics: 1, highlights: 1, bloom: 0.55, dropStrength: 1, decay: 1.4, speed: 1, loopDelay: 1.6, maxDpr: 4 };
const ANIMATION_SECONDS = 1.8;
type ExportSize = '720p' | '1080p' | '2K' | '4K';
const EXPORT_DIMENSIONS: Record<ExportSize, { width: number; height: number; scale: number }> = { '720p': { width: 1280, height: 720, scale: 2 / 3 }, '1080p': { width: 1920, height: 1080, scale: 1 }, '2K': { width: 2560, height: 1440, scale: 4 / 3 }, '4K': { width: 3840, height: 2160, scale: 2 } };
const SQUARE_VIDEO_DIMENSIONS: Record<ExportSize, { width: number; height: number; scale: number }> = { '720p': { width: 720, height: 720, scale: 2 / 3 }, '1080p': { width: 1080, height: 1080, scale: 1 }, '2K': { width: 2048, height: 2048, scale: 4 / 3 }, '4K': { width: 2160, height: 2160, scale: 2 } };
const waitFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('O navegador não conseguiu gerar a imagem PNG.')), 'image/png'));
const cropTransparentCanvas = (source: HTMLCanvasElement) => {
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Não foi possível analisar a transparência da imagem.');
  const { width, height } = source;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 1) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < left || bottom < top) return source;
  const padding = Math.max(16, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.035));
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);
  const cropped = document.createElement('canvas');
  cropped.width = right - left + 1;
  cropped.height = bottom - top + 1;
  const croppedContext = cropped.getContext('2d');
  if (!croppedContext) throw new Error('Não foi possível recortar a imagem.');
  croppedContext.drawImage(source, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped;
};

export default function App() {
  const [logo, setLogo] = useState('/logo-placeholder.svg');
  const [logoName, setLogoName] = useState('Logo de exemplo');
  const [logoMode, setLogoMode] = useState<'monochrome' | 'color'>('monochrome');
  const [backgroundImage, setBackgroundImage] = useState('');
  const [includeBackgroundInPng, setIncludeBackgroundInPng] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const [values, setValues] = useState(defaults);
  const [tile, setTile] = useState(true);
  const [loop, setLoop] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [exportSize, setExportSize] = useState<ExportSize>('4K');
  const [fps, setFps] = useState<30 | 60>(30);
  const [frameTime, setFrameTime] = useState(0);
  const [videoStart, setVideoStart] = useState(0);
  const [videoEnd, setVideoEnd] = useState(ANIMATION_SECONDS);
  const previewRef = useRef<HTMLDivElement>(null);
  const logoEngine = useRef<LiquidGlassLogoHandle>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const update = (key: keyof typeof defaults, value: number) => setValues(v => ({ ...v, [key]: value }));
  const readFile = (file: File, cb: (url: string) => void) => { const reader = new FileReader(); reader.onload = () => cb(String(reader.result)); reader.readAsDataURL(file); };
  const onLogo = (file?: File) => { if (!file) return; readFile(file, setLogo); setLogoName(file.name); };
  const onBackground = (file?: File) => { if (!file) return; readFile(file, setBackgroundImage); };
  const reset = () => { setValues(defaults); setTheme('dark'); setLogoMode('monochrome'); setTile(true); setLoop(false); setPaused(false); setFrameTime(0); setVideoStart(0); setVideoEnd(ANIMATION_SECONDS); setVideoFile(null); logoEngine.current?.play(); logoEngine.current?.replay(); };

  const seekFrame = (seconds: number) => {
    const safe = Math.max(0, Math.min(ANIMATION_SECONDS, seconds));
    setFrameTime(safe);
    setPaused(true);
    logoEngine.current?.pause();
    logoEngine.current?.seek(safe);
  };

  const createExportRenderer = async (renderSize: ExportSize = exportSize, square = false) => {
    const dimensions = square ? SQUARE_VIDEO_DIMENSIONS[renderSize] : EXPORT_DIMENSIONS[renderSize];
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = dimensions.width;
    renderCanvas.height = dimensions.height;
    renderCanvas.style.cssText = `position:fixed;left:-10000px;top:0;width:${dimensions.width / dimensions.scale}px;height:${dimensions.height / dimensions.scale}px;`;
    document.body.appendChild(renderCanvas);
    const themeValues = liquidGlassLogoThemes[theme];
    const tuning = normalizeLiquidGlassLogo({
      ...liquidGlassLogoDefaults,
      ...themeValues,
      logo,
      ending: 'logo',
      theme,
      logoRelief: values.logoRelief,
      logoSize: values.logoSize,
      glassScale: values.glassScale,
      iconScale: values.iconScale,
      logoColor: logoMode === 'color' ? 'original' : theme === 'dark' ? '#ffffff' : '#000000',
      logoScale: values.logoScale,
      finalLogoScale: values.finalLogoScale,
      tile: backgroundImage ? false : tile,
      depth: values.depth,
      dispersion: values.dispersion,
      relief: values.relief,
      caustics: values.caustics,
      highlights: values.highlights,
      bloom: values.bloom,
      dropStrength: values.dropStrength,
      decay: values.decay,
      speed: values.speed,
      loop: false,
      loopDelay: values.loopDelay,
      paused: true,
      background: backgroundImage ? 'transparent' : theme === 'dark' ? '#090b10' : '#eef1f6',
      maxDpr: dimensions.scale,
      outputScale: dimensions.scale,
    });
    const engineHolder: { current: NonNullable<ReturnType<typeof createLiquidGlassLogoRenderer>> | null } = { current: null };
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('O mecanismo gráfico demorou para iniciar.')), 12000);
        engineHolder.current = createLiquidGlassLogoRenderer(renderCanvas, tuning, () => { window.clearTimeout(timeout); resolve(); }, { preserveDrawingBuffer: true });
        if (!engineHolder.current) { window.clearTimeout(timeout); reject(new Error('Não foi possível iniciar o mecanismo gráfico.')); }
      });
      const readyEngine = engineHolder.current;
      if (!readyEngine) throw new Error('Não foi possível iniciar o mecanismo gráfico.');
      return { renderCanvas, engine: readyEngine, dimensions };
    } catch (error) {
      engineHolder.current?.dispose();
      renderCanvas.remove();
      throw error;
    }
  };

  const composeOutput = async (renderCanvas: HTMLCanvasElement, width: number, height: number, includeBackground: boolean) => {
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('Não foi possível criar a composição final.');
    if (includeBackground && backgroundImage) {
      const image = new Image();
      image.src = backgroundImage;
      await image.decode();
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    }
    ctx.drawImage(renderCanvas, 0, 0, width, height);
    return includeBackground ? output : cropTransparentCanvas(output);
  };

  const exportPng = async () => {
    setBusy(true);
    let rendered: Awaited<ReturnType<typeof createExportRenderer>> | null = null;
    try {
      rendered = await createExportRenderer();
      rendered.engine.renderAt(frameTime * values.speed);
      await waitFrame();
      const output = await composeOutput(rendered.renderCanvas, rendered.dimensions.width, rendered.dimensions.height, includeBackgroundInPng);
      const blob = await canvasBlob(output);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `liquid-glass-${exportSize}-${frameTime.toFixed(2)}s.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { alert(error instanceof Error ? error.message : 'Não foi possível exportar este quadro.'); }
    finally { rendered?.engine.dispose(); rendered?.renderCanvas.remove(); setBusy(false); }
  };

  const exportVideo = async () => {
    setBusy(true);
    setVideoFile(null);
    let rendered: Awaited<ReturnType<typeof createExportRenderer>> | null = null;
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    try {
      if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) throw new Error('Este navegador não oferece gravação de vídeo por canvas. Atualize o iOS e abra o app no Safari.');
      // Render the square animation at a mobile-friendly size, then upscale to the
      // selected square delivery size. This keeps the icon framing consistent.
      const renderSize: ExportSize = exportSize === '4K' ? '1080p' : exportSize === '2K' ? '720p' : exportSize;
      rendered = await createExportRenderer(renderSize, true);
      const { width, height } = SQUARE_VIDEO_DIMENSIONS[exportSize];
      const output = document.createElement('canvas'); output.width = width; output.height = height;
      const ctx = output.getContext('2d');
      if (!ctx) throw new Error('Não foi possível criar o quadro de vídeo.');
      const mimeTypes = ['video/mp4;codecs=avc1.42E01E', 'video/mp4'];
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('Este Safari não oferece gravação MP4 H.264 por MediaRecorder. Atualize o iOS e tente novamente.');
      let backgroundAsset: HTMLImageElement | null = null;
      if (backgroundImage) { backgroundAsset = new Image(); backgroundAsset.src = backgroundImage; await backgroundAsset.decode(); }
      // Desenha antes de iniciar a captura: Safari/iOS pode entregar um arquivo
      // vazio quando o MediaRecorder começa antes do primeiro quadro do canvas.
      const drawExportFrame = (seconds: number) => {
        rendered!.engine.renderAt(seconds * values.speed);
        ctx.clearRect(0, 0, width, height);
        if (backgroundAsset) {
          const scale = Math.max(width / backgroundAsset.naturalWidth, height / backgroundAsset.naturalHeight);
          const w = backgroundAsset.naturalWidth * scale, h = backgroundAsset.naturalHeight * scale;
          ctx.drawImage(backgroundAsset, (width - w) / 2, (height - h) / 2, w, h);
        } else {
          ctx.fillStyle = theme === 'dark' ? '#090b10' : '#eef1f6';
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(rendered!.renderCanvas, 0, 0, width, height);
      };

      const durationMs = Math.max(100, (videoEnd - videoStart) * 1000);
      const frameCount = Math.max(2, Math.round(durationMs * fps / 1000));
      drawExportFrame(videoStart);

      // Captura contínua do canvas: evita o modo manual (captureStream(0) /
      // requestFrame), que pode gerar zero quadros em alguns navegadores móveis.
      stream = output.captureStream(fps);
      const chunks: BlobPart[] = [];
      try {
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: exportSize === '4K' ? 12_000_000 : 8_000_000 });
      } catch {
        recorder = new MediaRecorder(stream, { mimeType });
      }
      let recorderError: Error | null = null;
      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder!.onstop = () => recorderError ? reject(recorderError) : resolve();
        recorder!.onerror = () => {
          recorderError = new Error('O navegador interrompeu a gravação do vídeo.');
          reject(recorderError);
        };
      });

      // O primeiro quadro já foi desenhado antes do start; timeslice força
      // entregas periódicas de dados, inclusive em implementações móveis.
      recorder.start(250);
      const startedAt = performance.now();
      let lastFrame = -1;
      while (true) {
        const elapsed = performance.now() - startedAt;
        if (elapsed >= durationMs) break;
        const frame = Math.min(frameCount - 1, Math.floor(elapsed * fps / 1000));
        if (frame !== lastFrame) {
          drawExportFrame(videoStart + frame / fps);
          lastFrame = frame;
        }
        const nextFrameAt = startedAt + ((frame + 1) * 1000 / fps);
        await new Promise<void>(resolve => window.setTimeout(resolve, Math.max(1, Math.min(12, nextFrameAt - performance.now()))));
      }
      drawExportFrame(videoEnd);
      await new Promise<void>(resolve => window.setTimeout(resolve, 300));
      recorder.stop();
      await stopped;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (!blob.size) throw new Error('A gravação terminou sem quadros codificados. Isso pode ocorrer quando o navegador não consegue codificar esta resolução. Tente selecionar 1080p e gerar novamente.');
      const filename = 'liquid-glass-' + exportSize + '-' + fps + 'fps-' + Date.now() + '.mp4';
      setVideoFile(new File([blob], filename, { type: 'video/mp4' }));
      seekFrame(videoEnd);
    } catch (error) { alert(error instanceof Error ? error.message : 'Não foi possível exportar o vídeo.'); }
    finally { stream?.getTracks().forEach(track => track.stop()); rendered?.engine.dispose(); rendered?.renderCanvas.remove(); setBusy(false); }
  };
  const saveVideo = async () => {
    if (!videoFile) {
      alert('Gere o vídeo primeiro para depois salvar.');
      return;
    }
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
    // Tenta compartilhar no iPhone; se o Safari rejeitar a folha de compartilhamento,
    // recorre ao download direto em vez de encerrar com erro.
    if (nav.share && nav.canShare) {
      try {
        if (nav.canShare({ files: [videoFile] })) {
          await nav.share({ files: [videoFile], title: 'Liquid Glass Studio' });
          return;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    try {
      const url = URL.createObjectURL(videoFile);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = videoFile.name.endsWith('.mp4') ? videoFile.name : videoFile.name + '.mp4';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      alert('O vídeo foi gerado, mas o Safari não conseguiu iniciar o download. Toque em Compartilhar e escolha Salvar em Arquivos.');
    }
  };

  const controls = useMemo(() => [
    { title: 'Logo', items: [ ['Tamanho base da lente', 'logoSize', 96, 512, 1], ['Escala da logo', 'logoScale', 0.2, 1, 0.01], ['Escala final', 'finalLogoScale', 0.2, 1.5, 0.01], ['Tamanho do Liquid Glass', 'glassScale', 0.5, 2.5, 0.01], ['Tamanho do ícone', 'iconScale', 0.5, 4, 0.01], ['Relevo da logo', 'logoRelief', 0, 1, 0.01] ] },
    { title: 'Vidro e luz', items: [ ['Profundidade óptica', 'depth', 0, 3, 0.01], ['Dispersão', 'dispersion', 0, 3, 0.01], ['Relevo do vidro', 'relief', 0, 3, 0.01], ['Caústicas', 'caustics', 0, 3, 0.01], ['Reflexos', 'highlights', 0, 3, 0.01], ['Bloom', 'bloom', 0, 2, 0.01], ['Força da gota', 'dropStrength', 0, 3, 0.01] ] },
    { title: 'Animação', items: [ ['Tempo de reflexo', 'decay', 0, 4, 0.01], ['Velocidade', 'speed', 0.1, 3, 0.01], ['Densidade de pixels', 'maxDpr', 1, 4, 0.1], ['Pausa antes do loop', 'loopDelay', 0, 5, 0.1] ] }
  ] as const, []);

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><img src={appIcon} alt="Liquid Glass Studio" /></div><div><strong>LIQUID GLASS</strong><span>STUDIO · MOBILE</span></div></div></header>
    <div className="workspace"><aside className="sidebar"><div className="section-head"><span>01 / ARQUIVOS</span></div>
      <button className="upload-card" onClick={() => logoInput.current?.click()}><div className="upload-icon"><ImagePlus size={20}/></div><div><b>Carregar logotipo</b><small>SVG, PNG, WebP ou JPG</small></div><Upload size={15}/></button><input ref={logoInput} type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" hidden onChange={e=>onLogo(e.target.files?.[0])}/><div className="file-name">{logoName}</div><div className="theme-switch logo-mode-switch"><button className={logoMode==='monochrome'?'selected':''} onClick={()=>setLogoMode('monochrome')}><span className="mode-swatch monochrome-swatch"/> Ícone chapado</button><button className={logoMode==='color'?'selected':''} onClick={()=>setLogoMode('color')}><span className="mode-swatch color-swatch"/> Imagem colorida</button></div><small className="mode-description">{logoMode==='monochrome'?'O arquivo vira uma silhueta branca no tema escuro e preta no tema claro.':'Preserva as cores originais da imagem enviada.'}</small>
      <button className="upload-card secondary" onClick={() => bgInput.current?.click()}><div className="upload-icon"><ImagePlus size={20}/></div><div><b>Imagem de fundo</b><small>Opcional · imagem ou textura</small></div><Upload size={15}/></button><input ref={bgInput} type="file" accept="image/*" hidden onChange={e=>onBackground(e.target.files?.[0])}/><label className="toggle-row compact-toggle"><span>Incluir fundo no PNG</span><input type="checkbox" checked={includeBackgroundInPng} onChange={e=>setIncludeBackgroundInPng(e.target.checked)} disabled={!backgroundImage}/><i/></label>
      <div className="section-head spaced"><span>02 / APARÊNCIA</span></div><div className="theme-switch"><button className={theme==='dark'?'selected':''} onClick={()=>setTheme('dark')}><Moon size={15}/> Escuro</button><button className={theme==='light'?'selected':''} onClick={()=>setTheme('light')}><Sun size={15}/> Claro</button></div>
      <label className="toggle-row"><span>Placa de vidro</span><input type="checkbox" checked={tile} onChange={e=>setTile(e.target.checked)}/><i/></label><label className="toggle-row"><span>Repetir animação</span><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/><i/></label><label className="toggle-row"><span>Pausar animação</span><input type="checkbox" checked={paused} onChange={e=>{setPaused(e.target.checked); if(e.target.checked) logoEngine.current?.pause(); else logoEngine.current?.play();}}/><i/></label>
      <div className="hint"><Sparkles size={14}/><p>O efeito é renderizado pelo componente original ReactDrops. Depois de instalado, não precisa de internet.</p></div>
    </aside>
    <section className="main-panel"><div className="mobile-export-toolbar"><div className="top-actions"><span className="offline"><i/> PWA · OFFLINE</span><select aria-label="Resolução de exportação" value={exportSize} onChange={e=>setExportSize(e.target.value as ExportSize)} className="export-size"><option value="720p">720p</option><option value="1080p">1080p</option><option value="2K">2K</option><option value="4K">4K</option></select><select aria-label="Quadros por segundo" value={fps} onChange={e=>{const next=Number(e.target.value) as 30 | 60;setFps(next);const maxStart=ANIMATION_SECONDS-1/next;if(videoStart>maxStart)setVideoStart(maxStart);if(videoEnd<videoStart+1/next)setVideoEnd(ANIMATION_SECONDS);}} className="export-size"><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select><button className="ghost restore-button" onClick={reset}><RotateCcw size={15}/> Restaurar</button><button className="export mp4-button" onClick={exportVideo} disabled={busy}><Film size={16}/>{busy?'Gerando MP4…':'Gerar novo MP4'}</button>{videoFile && <button className="ghost save-video-button" onClick={saveVideo} disabled={busy}><Download size={15}/> Salvar último MP4</button>}</div></div><div className="sticky-preview"><div className="preview-heading"><div><span className="eyebrow">03 / PRÉ-VISUALIZAÇÃO</span><h1>Seu logotipo em <em>Liquid Glass.</em></h1></div><span className="live"><i/> AO VIVO</span></div>
      <div className={`preview-stage ${theme} normal-preview`} ref={previewRef}>
        <div className="stage-grid"/>
        <div className="normal-video-canvas"><LiquidGlassLogo ref={logoEngine} logo={logo} ending="logo" theme={theme} logoRelief={values.logoRelief} logoSize={values.logoSize} logoScale={values.logoScale} finalLogoScale={values.finalLogoScale} glassScale={values.glassScale} iconScale={values.iconScale} logoColor={logoMode === 'color' ? 'original' : theme === 'dark' ? '#ffffff' : '#000000'} tile={tile} depth={values.depth} dispersion={values.dispersion} relief={values.relief} caustics={values.caustics} highlights={values.highlights} bloom={values.bloom} dropStrength={values.dropStrength} decay={values.decay} speed={values.speed} loop={loop} loopDelay={values.loopDelay} paused={paused} background={backgroundImage ? 'transparent' : theme==='dark'?'#090b10':'#eef1f6'} backgroundImage={backgroundImage || undefined} maxDpr={values.maxDpr} outputScale={4} style={{height: '100%', width:'100%'}} /></div>
        <div className="preview-caption"><span>LIQUID GLASS ENGINE</span><span>PRÉVIA · VÍDEO 1:1</span></div>
      </div></div>
      <div className="editor-controls-scroll"><div className="timeline-panel"><div className="timeline-title"><div><span className="eyebrow">04 / ESCOLHER QUADRO</span><b>Frame selecionado</b></div><output>{frameTime.toFixed(2)} s · {Math.round(frameTime*fps)} / {Math.round(ANIMATION_SECONDS*fps)} frames</output></div><input aria-label="Selecionar frame da animação" className="timeline-range" type="range" min="0" max={ANIMATION_SECONDS} step={1/fps} value={frameTime} onChange={e=>seekFrame(Number(e.target.value))}/><div className="timeline-actions"><button onClick={()=>seekFrame(0)}><SkipBack size={14}/> Início</button><button onClick={()=>{if(paused){setPaused(false);logoEngine.current?.play();}else{setPaused(true);logoEngine.current?.pause();}}}>{paused?<Play size={14}/>:<Pause size={14}/>} {paused?'Reproduzir':'Pausar'}</button><button onClick={()=>seekFrame(ANIMATION_SECONDS)}><SkipForward size={14}/> Final</button><span>Escolha o instante exato e exporte o quadro em alta resolução.</span><button className="frame-png" onClick={exportPng} disabled={busy}><Download size={14}/> Salvar frame PNG</button></div><div className="video-range-grid"><label>Início do vídeo <output>{videoStart.toFixed(2)} s</output><input type="range" min="0" max={ANIMATION_SECONDS-1/fps} step={1/fps} value={videoStart} onChange={e=>{const next=Number(e.target.value);setVideoStart(next);if(videoEnd<=next) setVideoEnd(Math.min(ANIMATION_SECONDS,next+1/fps));}}/></label><label>Fim do vídeo <output>{videoEnd.toFixed(2)} s</output><input type="range" min={Math.min(ANIMATION_SECONDS,videoStart+1/fps)} max={ANIMATION_SECONDS} step={1/fps} value={videoEnd} onChange={e=>setVideoEnd(Number(e.target.value))}/></label></div></div>
      <div className="controls-grid">{controls.map(group=><div className="control-group" key={group.title}><h3>{group.title}</h3>{group.items.map(([label,key,min,max,step])=><label className="range-control" key={key}><span>{label}<b>{values[key].toFixed(step<1?2:0)}</b></span><input type="range" min={min} max={max} step={step} value={values[key]} onChange={e=>update(key,Number(e.target.value))}/></label>)}</div>)}</div></div>
    </section></div>
    <footer><span>LIQUID GLASS STUDIO <b>1.3.0</b></span><span>Renderização local · Otimizado para iPhone e GitHub Pages</span></footer>
  </main>;
}
