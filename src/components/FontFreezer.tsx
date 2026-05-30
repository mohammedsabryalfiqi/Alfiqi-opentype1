import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UploadCloud, CheckCircle, Download, FileType, Info,
  Loader2, Terminal, Trash2, Sliders, Moon, Sun, ChevronDown
} from 'lucide-react';
import { useDarkMode } from '@/hooks/useDarkMode';
import {
  initPyodide, getFontFeatures, getVariableFontInfo, freezeAll, unfreezeVariableAxes,
  type FreezeResult, type AxisInfo, type PinnedAxis, type LoadingStage
} from '@/services/pyodideService';
import ArabicPattern from './ArabicPattern';
import { trackUpload, trackDownload } from '@/lib/tracking';

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  ss01: 'مجموعة أسلوبية 1', ss02: 'مجموعة أسلوبية 2', ss03: 'مجموعة أسلوبية 3',
  ss04: 'مجموعة أسلوبية 4', ss05: 'مجموعة أسلوبية 5', ss06: 'مجموعة أسلوبية 6',
  ss07: 'مجموعة أسلوبية 7', ss08: 'مجموعة أسلوبية 8', ss09: 'مجموعة أسلوبية 9',
  ss10: 'مجموعة أسلوبية 10', ss11: 'مجموعة أسلوبية 11', ss12: 'مجموعة أسلوبية 12',
  ss13: 'مجموعة أسلوبية 13', ss14: 'مجموعة أسلوبية 14', ss15: 'مجموعة أسلوبية 15',
  ss16: 'مجموعة أسلوبية 16', ss17: 'مجموعة أسلوبية 17', ss18: 'مجموعة أسلوبية 18',
  ss19: 'مجموعة أسلوبية 19', ss20: 'مجموعة أسلوبية 20',
  cv01: 'متغير حرف 1', cv02: 'متغير حرف 2', cv03: 'متغير حرف 3',
  cv04: 'متغير حرف 4', cv05: 'متغير حرف 5', cv06: 'متغير حرف 6',
  cv07: 'متغير حرف 7', cv08: 'متغير حرف 8', cv09: 'متغير حرف 9',
  cv10: 'متغير حرف 10',
  swsh: 'حركات زخرفية (Swash)', titl: 'أحرف عنوانية',
  salt: 'بدائل أسلوبية', aalt: 'كل البدائل',
  smcp: 'أحرف صغيرة', c2sc: 'أحرف كبيرة لصغيرة',
  dlig: 'ربط اختياري', hlig: 'ربط تاريخي',
  lnum: 'أرقام كبيرة', onum: 'أرقام قديمة',
  pnum: 'أرقام متناسبة', tnum: 'أرقام جدولية',
  frac: 'كسور', zero: 'صفر مشطوب',
  ordn: 'ترتيبات', subs: 'حروف سفلية', sups: 'حروف علوية',
  mgrk: 'يونانية رياضية', ornm: 'زخرفات',
};

const AXIS_NAMES: Record<string, string> = {
  wght: 'الوزن (Weight)', wdth: 'العرض (Width)', ital: 'المائل (Italic)',
  slnt: 'الميلان (Slant)', opsz: 'الحجم البصري (Optical Size)',
  GRAD: 'التدرج (Grade)', CASL: 'عرضي (Casual)', CRSV: 'مُنحنٍ (Cursive)',
  FILL: 'تعبئة (Fill)', MONO: 'ثابت العرض (Mono)', SOFT: 'نعومة (Softness)', WONK: 'غرابة (Wonk)',
};

let fontKeyCounter = 0;

const FontFreezer: React.FC = () => {
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const [isPyodideLoading, setIsPyodideLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('script');
  const [loadingMessage, setLoadingMessage] = useState('جاري بدء التحميل...');
  const [pyodideError, setPyodideError] = useState('');
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [fontUrl, setFontUrl] = useState<string>('');
  const [fontBuffer, setFontBuffer] = useState<ArrayBuffer | null>(null);
  const [fontKey, setFontKey] = useState(0);
  const [customFileName, setCustomFileName] = useState<string>('');

  const [availableFeatures, setAvailableFeatures] = useState<string[]>([]);
  const [frozenFeatures, setFrozenFeatures] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const [axes, setAxes] = useState<AxisInfo[]>([]);
  const [axisValues, setAxisValues] = useState<Record<string, number>>({});
  const [selectedAxesToFreeze, setSelectedAxesToFreeze] = useState<Set<string>>(new Set());
  const [isAxisProcessing, setIsAxisProcessing] = useState(false);
  const [pinnedAxes, setPinnedAxes] = useState<PinnedAxis[]>([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [previewText, setPreviewText] = useState(
    'بسم الله الرحمن الرحيم'
  );
  const [fontSize, setFontSize] = useState(36);
  const [activeTab, setActiveTab] = useState<'features' | 'axes'>('features');

  const [logs, setLogs] = useState<Array<{ type: 'info' | 'success' | 'error'; text: string }>>([]);
  const [lastResult, setLastResult] = useState<FreezeResult | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((type: 'info' | 'success' | 'error', text: string) => {
    setLogs(prev => [...prev, { type, text }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 100);
  }, []);


  useEffect(() => {
    if (fontUrl && previewRef.current) {
      if (!previewRef.current.textContent) {
        previewRef.current.textContent = previewText;
      }
    }
  }, [fontUrl]);

  useEffect(() => {
    let cancelled = false;
    addLog('info', '⏳ جاري تحميل محرك Python + FontTools...');
    initPyodide((stage, message) => {
      if (cancelled) return;
      setLoadingStage(stage);
      setLoadingMessage(message);
    })
      .then(() => {
        if (cancelled) return;
        setIsPyodideLoading(false);
        addLog('success', '✅ تم تحميل المحرك بنجاح! يمكنك رفع الخط الآن.');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Pyodide Load Error', err);
        setPyodideError('فشل في تحميل محرك الخطوط. تأكد من اتصالك بالإنترنت.');
        addLog('error', `❌ فشل تحميل المحرك: ${err.message || err}`);
      });
    return () => { cancelled = true; };
  }, [addLog]);

  const fontUrlRef = useRef(fontUrl);
  fontUrlRef.current = fontUrl;
  useEffect(() => {
    return () => {
      if (fontUrlRef.current) URL.revokeObjectURL(fontUrlRef.current);
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fontUrl) URL.revokeObjectURL(fontUrl);
    setFontFile(file);
    const dotIdx = file.name.lastIndexOf('.');
    setCustomFileName(dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name);
    setLastResult(null);
    setAvailableFeatures([]);
    setFrozenFeatures([]);
    setSelectedFeatures([]);
    setAxes([]);
    setAxisValues({});
    setSelectedAxesToFreeze(new Set());
    setPinnedAxes([]);
    const url = URL.createObjectURL(file);
    setFontUrl(url);
    fontKeyCounter++;
    setFontKey(fontKeyCounter);

    const buffer = await file.arrayBuffer();
    setFontBuffer(buffer);

    addLog('info', `📂 تم رفع: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    addLog('info', '🔍 جاري تحليل خصائص الخط...');

    // Track upload to Lovable Cloud (background)
    trackUpload({ fontName: file.name, fileSize: file.size, file }).catch(() => {});

    try {
      const [featResult, varInfo] = await Promise.all([
        getFontFeatures(buffer),
        getVariableFontInfo(buffer),
      ]);

      if (featResult.error) {
        addLog('error', `❌ خطأ في قراءة الخصائص: ${featResult.error}`);
        setAvailableFeatures([]);
        setFrozenFeatures([]);
        setSelectedFeatures([]);
      } else {
        setAvailableFeatures(featResult.features);
        setFrozenFeatures(featResult.frozenFeatures || []);
        setSelectedFeatures(featResult.frozenFeatures || []);

        if (featResult.features.length > 0) {
          addLog('success', `✅ تم العثور على ${featResult.features.length} خاصية اختيارية: ${featResult.features.join(', ')}`);
        } else {
          addLog('info', '⚠️ لا توجد خصائص اختيارية (مثل ss01) في هذا الخط.');
        }
        if (featResult.frozenFeatures && featResult.frozenFeatures.length > 0) {
          addLog('info', `🧊 الخط يحتوي على خصائص مُفعّلة مسبقاً: ${featResult.frozenFeatures.join(', ')}`);
        }
      }

      setPinnedAxes(varInfo.pinnedAxes || []);
      if (varInfo.isVariable && varInfo.axes.length > 0) {
        setAxes(varInfo.axes);
        const defaults: Record<string, number> = {};
        varInfo.axes.forEach(a => { defaults[a.tag] = a.defaultValue; });
        setAxisValues(defaults);
        setSelectedAxesToFreeze(new Set());
        setActiveTab('axes');
        addLog('success', `📐 خط متغير! تم العثور على ${varInfo.axes.length} محور: ${varInfo.axes.map(a => a.tag).join(', ')}`);
        if (varInfo.pinnedAxes && varInfo.pinnedAxes.length > 0) {
          addLog('info', `📌 ${varInfo.pinnedAxes.length} محور مثبت: ${varInfo.pinnedAxes.map(a => a.tag).join(', ')} — يمكن استعادتها`);
        }
      } else if (varInfo.isVariable && varInfo.pinnedAxes && varInfo.pinnedAxes.length > 0 && varInfo.axes.length === 0) {
        setAxes([]);
        setAxisValues({});
        setSelectedAxesToFreeze(new Set());
        setActiveTab('axes');
        addLog('info', `📌 جميع المحاور مثبتة (${varInfo.pinnedAxes.length}): ${varInfo.pinnedAxes.map(a => a.tag).join(', ')} — يمكن استعادتها`);
      } else {
        setAxes([]);
        setAxisValues({});
        setSelectedAxesToFreeze(new Set());
        if (featResult.features.length > 0) setActiveTab('features');
      }
    } catch (err: any) {
      console.error(err);
      addLog('error', `❌ خطأ غير متوقع: ${err.message || err}`);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.ttf') || file.name.endsWith('.otf'))) {
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, []);

  const toggleFeature = useCallback((feature: string) => {
    setSelectedFeatures(prev =>
      prev.includes(feature) ? prev.filter(f => f !== feature) : [...prev, feature]
    );
  }, []);

  const selectAll = () => setSelectedFeatures([...availableFeatures]);
  const deselectAll = () => setSelectedFeatures([]);

  const handleResetToOriginal = async () => {
    if (!fontBuffer || !fontFile || frozenFeatures.length === 0) return;
    setIsProcessing(true);
    setLastResult(null);
    setSelectedFeatures([]);
    addLog('info', `🔄 إلغاء تفعيل جميع الخصائص: ${frozenFeatures.join(', ')} — إعادة الخط للأصل`);

    try {
      const { result, bytes } = await freezeAll(fontBuffer, undefined, [], undefined, computeInternalName('unfreeze', false));
      const freezeResult: FreezeResult = {
        success: result.success,
        error: result.error,
        lookups_count: result.lookups_count,
        injected_into: result.injected_into,
        source_features: result.source_features,
        action: 'unfreeze',
      };
      setLastResult(freezeResult);

      if (!result.success) {
        addLog('error', `❌ فشل: ${result.error}`);
      } else {
        addLog('success', `✅ تم إعادة الخط للأصل بنجاح!`);
        if (bytes) {
          downloadFont(bytes, 'unfreeze', false);
        }
      }
    } catch (err: any) {
      console.error(err);
      addLog('error', `❌ خطأ غير متوقع: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnfreezeAxes = async () => {
    if (!fontBuffer || !fontFile || pinnedAxes.length === 0) return;
    setIsAxisProcessing(true);
    addLog('info', `🔓 استعادة المحاور المثبتة: ${pinnedAxes.map(a => a.tag).join(', ')}`);

    try {
      const result = await unfreezeVariableAxes(fontBuffer);
      if (!result.success) {
        addLog('error', `❌ فشل: ${result.error}`);
        return;
      }
      addLog('success', `✅ تم استعادة ${result.restored?.length || 0} محور: ${result.restored?.join(', ')}`);
      if (!result.hasVariationData) {
        addLog('info', `⚠️ لا توجد بيانات تباين (gvar) — المحاور قد لا تعمل بدون الخط الأصلي`);
      }
      if (result.bytes) {
        const newBuffer = result.bytes.buffer.slice(
          result.bytes.byteOffset,
          result.bytes.byteOffset + result.bytes.byteLength
        ) as ArrayBuffer;
        setFontBuffer(newBuffer);
        if (fontUrl) URL.revokeObjectURL(fontUrl);
        const blob = new Blob([result.bytes as BlobPart], { type: 'font/ttf' });
        const newUrl = URL.createObjectURL(blob);
        setFontUrl(newUrl);
        fontKeyCounter++;
        setFontKey(fontKeyCounter);

        const varInfo = await getVariableFontInfo(newBuffer);
        setPinnedAxes(varInfo.pinnedAxes || []);
        if (varInfo.axes.length > 0) {
          setAxes(varInfo.axes);
          const defaults: Record<string, number> = {};
          varInfo.axes.forEach(a => { defaults[a.tag] = a.defaultValue; });
          setAxisValues(defaults);
          setSelectedAxesToFreeze(new Set());
          addLog('success', `📐 المحاور المتاحة الآن: ${varInfo.axes.map(a => a.tag).join(', ')}`);
        }

        downloadFont(result.bytes, 'unfreeze-axes');
      }
    } catch (err: any) {
      addLog('error', `❌ خطأ: ${err.message || err}`);
    } finally {
      setIsAxisProcessing(false);
    }
  };

  const featuresToFreeze = selectedFeatures.filter(f => !frozenFeatures.includes(f));
  const featuresToUnfreeze = frozenFeatures.filter(f => !selectedFeatures.includes(f));
  const hasChanges = featuresToFreeze.length > 0 || featuresToUnfreeze.length > 0;

  const handleProcessAndDownload = async () => {
    if (!fontBuffer || !fontFile || !hasChanges) return;
    setIsProcessing(true);
    setLastResult(null);

    const axesToApply = selectedAxesToFreeze.size > 0
      ? Object.fromEntries([...selectedAxesToFreeze].map(tag => [tag, axisValues[tag]]))
      : undefined;

    if (featuresToFreeze.length > 0 && featuresToUnfreeze.length > 0) {
      addLog('info', `🔧 تفعيل: ${featuresToFreeze.join(', ')} | إلغاء تفعيل: ${featuresToUnfreeze.join(', ')}`);
    } else if (featuresToFreeze.length > 0) {
      addLog('info', `🔧 بدء التفعيل: ${featuresToFreeze.join(', ')}`);
    } else {
      addLog('info', `🔧 بدء إلغاء التفعيل: ${featuresToUnfreeze.join(', ')}`);
    }
    if (axesToApply) {
      addLog('info', `📐 مع تثبيت المحاور: ${Object.entries(axesToApply).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }

    try {
      const { result, bytes } = await freezeAll(fontBuffer, axesToApply, selectedFeatures, undefined, computeInternalName('freeze', selectedFeatures.length > 0));
      const freezeResult: FreezeResult = {
        success: result.success,
        error: result.error,
        lookups_count: result.lookups_count,
        injected_into: result.injected_into,
        source_features: result.source_features,
        action: result.action as any,
      };
      setLastResult(freezeResult);

      if (!result.success) {
        addLog('error', `❌ فشل: ${result.error}`);
      } else {
        addLog('success', `✅ تمت المعالجة بنجاح!`);
        if (result.metrics_preserved) {
          addLog('success', `📏 تم حفظ مقاييس الخط الأصلية — لن يتغير حجم الخط.`);
        }
        if (result.lookups_count) {
          addLog('info', `   📊 عدد الـ Lookups المعدلة: ${result.lookups_count}`);
        }
        if (bytes) {
          downloadFont(bytes, result.action || 'freeze', selectedFeatures.length > 0);
        }
      }
    } catch (err: any) {
      console.error(err);
      addLog('error', `❌ خطأ غير متوقع: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFreezeAxes = async () => {
    if (!fontBuffer || !fontFile || selectedAxesToFreeze.size === 0) return;
    setIsAxisProcessing(true);

    const valuesToFreeze: Record<string, number> = {};
    selectedAxesToFreeze.forEach(tag => { valuesToFreeze[tag] = axisValues[tag]; });
    const featuresToApply = hasChanges ? selectedFeatures : undefined;

    const axisDesc = Object.entries(valuesToFreeze).map(([k, v]) => `${k}=${v}`).join(', ');
    addLog('info', `📐 تثبيت المحاور: ${axisDesc}`);
    if (featuresToApply && featuresToApply.length > 0) {
      addLog('info', `🔧 مع تفعيل الخصائص: ${featuresToApply.join(', ')}`);
    }

    try {
      const { result, bytes } = await freezeAll(fontBuffer, valuesToFreeze, featuresToApply, undefined, computeInternalName('axes', (featuresToApply?.length || 0) > 0));
      if (!result.success) {
        addLog('error', `❌ فشل التثبيت: ${result.error}`);
        return;
      }
      addLog('success', `✅ تم تثبيت المحاور بنجاح! (الطريقة: ${result.axis_method || 'auto'})`);
      if (result.metrics_preserved) {
        addLog('success', `📏 تم حفظ مقاييس الخط الأصلية (OS/2 & hhea) — لن يتغير حجم الخط.`);
      }
      if (result.lookups_count) {
        addLog('info', `   📊 عدد الـ Lookups المعدلة: ${result.lookups_count}`);
      }
      if (bytes) downloadFont(bytes, 'axes');
    } catch (err: any) {
      addLog('error', `❌ خطأ: ${err.message || err}`);
    } finally {
      setIsAxisProcessing(false);
    }
  };

  const computeInternalName = (action: string, hasFrozenFeatures?: boolean): string => {
    if (!fontFile) return '';
    const dotIdx = fontFile.name.lastIndexOf('.');
    const originalBase = dotIdx > 0 ? fontFile.name.substring(0, dotIdx) : fontFile.name;
    const baseName = (customFileName.trim() || originalBase).trim();
    let finalName = baseName;
    // Apply automatic suffixes only if user kept the original name
    if (baseName === originalBase) {
      if (action === 'unfreeze-axes') {
        finalName = baseName.replace(/[\s-]?instance$/i, '') + '-VF';
      } else if (action === 'axes') {
        finalName = baseName + '-instance';
      } else if (hasFrozenFeatures) {
        if (!baseName.toLowerCase().includes('mob')) {
          finalName = baseName + '-mob';
        }
      } else {
        finalName = baseName.replace(/[\s-]?mob$/i, '').replace(/[\s-]?mob([\s-])/i, '$1');
      }
    }
    return finalName.replace(/[\\/:*?"<>|]/g, '').trim();
  };

  const downloadFont = (bytes: Uint8Array, action: string, hasFrozenFeatures?: boolean) => {
    if (!fontFile) return;

    const dotIdx = fontFile.name.lastIndexOf('.');
    const originalBase = dotIdx > 0 ? fontFile.name.substring(0, dotIdx) : fontFile.name;
    const ext = dotIdx > 0 ? fontFile.name.substring(dotIdx) : '.ttf';

    // Use custom name if provided, otherwise fall back to original
    const baseName = (customFileName.trim() || originalBase).trim();

    let finalBaseName = baseName;
    // Only apply automatic suffixes if user kept the original name
    if (baseName === originalBase) {
      if (action === 'unfreeze-axes') {
        finalBaseName = baseName.replace(/[\s-]?instance$/i, '') + '-VF';
      } else if (action === 'axes') {
        finalBaseName = baseName + '-instance';
      } else if (hasFrozenFeatures) {
        if (!baseName.toLowerCase().includes('mob')) {
          finalBaseName = baseName + '-mob';
        }
      } else {
        finalBaseName = baseName.replace(/[\s-]?mob$/i, '').replace(/[\s-]?mob([\s-])/i, '$1');
      }
    }

    // Sanitize filename: remove invalid characters
    finalBaseName = finalBaseName.replace(/[\\/:*?"<>|]/g, '').trim() || 'font';

    const fileName = finalBaseName + ext;

    const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
    const doFallbackDownload = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 3000);
    };

    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (!reader.result) { doFallbackDownload(); return; }
        const a = document.createElement('a');
        a.href = reader.result as string;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 500);
      };
      reader.onerror = () => doFallbackDownload();
      reader.readAsDataURL(blob);
    } catch (e) {
      doFallbackDownload();
    }

    addLog('success', `📥 تم تحميل: ${fileName} (${(bytes.length / 1024).toFixed(1)} KB)`);
    trackDownload().catch(() => {});
  };

  const resetAll = () => {
    if (fontUrl) URL.revokeObjectURL(fontUrl);
    setFontFile(null);
    setFontUrl('');
    setCustomFileName('');
    setFontBuffer(null);
    setAvailableFeatures([]);
    setFrozenFeatures([]);
    setSelectedFeatures([]);
    setAxes([]);
    setAxisValues({});
    setSelectedAxesToFreeze(new Set());
    setLastResult(null);
    setPinnedAxes([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    addLog('info', '🗑️ تم إعادة التعيين.');
  };

  const getPreviewStyle = (): React.CSSProperties => {
    if (!fontUrl) return {};
    const baseStyle: React.CSSProperties = {
      fontFamily: `"PreviewFont-${fontKey}", sans-serif`,
      fontSize: `${fontSize}px`,
      lineHeight: 1.8,
    };
    if (selectedFeatures.length > 0) {
      (baseStyle as any).fontFeatureSettings = selectedFeatures.map(f => `"${f}" 1`).join(', ');
    }
    if (axes.length > 0) {
      (baseStyle as any).fontVariationSettings = Object.entries(axisValues)
        .map(([tag, val]) => `"${tag}" ${val}`)
        .join(', ');
    }
    return baseStyle;
  };

  const fontFaceCSS = fontUrl
    ? `@font-face { font-family: "PreviewFont-${fontKey}"; src: url("${fontUrl}") format("truetype"); font-display: swap; }`
    : '';

  const toggleAxisFreeze = (tag: string) => {
    setSelectedAxesToFreeze(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const hasAxisChanges = selectedAxesToFreeze.size > 0;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {fontUrl && <style>{fontFaceCSS}</style>}

      {/* Compact Header Bar */}
      <header className="relative bg-header-bg">
        <ArabicPattern />
        <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="لوجو" className="w-12 h-12 object-contain" />
            <div>
              <h1 className="text-sm font-bold text-header-fg leading-none">موقع الأوبن تايب V2</h1>
              <p className="text-[10px] text-header-fg/40 mt-0.5">تفعيل خصائص الخطوط العربية</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-header-fg/35">
              {['TTF & OTF', 'خصوصية تامة', 'بدون خادم'].map((t, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-header-accent/50" />
                  {t}
                </span>
              ))}
            </div>
            <button
              onClick={toggleDarkMode}
              className="p-1.5 rounded-md text-header-fg/50 hover:text-header-accent transition-colors"
              title={isDark ? 'الوضع الفاتح' : 'الوضع المظلم'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Sidebar: Upload + Controls (4 cols) */}
          <div className="lg:col-span-4 space-y-4">

            {/* Upload */}
            <div className="glass-card p-4">
              <input type="file" accept=".ttf,.otf" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />

              {isPyodideLoading ? (
                <div className="flex flex-col items-center justify-center text-center py-5">
                  <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-3" />
                  <p className="text-xs font-medium text-foreground">{loadingMessage}</p>
                  <div className="flex items-center gap-1 mt-3">
                    {(['script', 'runtime', 'packages', 'ready'] as LoadingStage[]).map((stage, i) => {
                      const stages: LoadingStage[] = ['script', 'runtime', 'packages', 'ready'];
                      const currentIdx = stages.indexOf(loadingStage);
                      const isDone = i < currentIdx;
                      const isCurrent = i === currentIdx;
                      return (
                        <div key={stage} className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full transition-all ${isDone ? 'bg-primary' : isCurrent ? 'bg-primary animate-pulse' : 'bg-muted-foreground/20'}`} />
                          {i < 3 && <div className={`w-4 h-px ${isDone ? 'bg-primary/40' : 'bg-muted-foreground/10'}`} />}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-muted-foreground text-[10px] mt-2">مرة واحدة فقط</p>
                </div>
              ) : pyodideError ? (
                <div className="text-center py-5 text-destructive">
                  <p className="font-medium text-xs">{pyodideError}</p>
                  <button onClick={() => window.location.reload()} className="mt-2 underline text-primary text-xs">إعادة تحميل</button>
                </div>
              ) : !fontFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer text-center transition-all border-primary/25 hover:border-primary/50 hover:bg-primary/[0.03] group"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/8 flex items-center justify-center mb-3 group-hover:bg-primary/12 transition-colors">
                    <UploadCloud className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm font-bold text-foreground mb-0.5">ارفع ملف الخط</p>
                  <p className="text-muted-foreground text-[11px]">TTF أو OTF — اسحب أو اضغط</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/15 bg-primary/[0.02]">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileType className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-xs truncate" dir="ltr">{fontFile.name}</p>
                    <p className="text-[10px] text-muted-foreground">{(fontFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={resetAll} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors" title="حذف">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Custom file name editor */}
              {fontFile && (
                <div className="mt-2">
                  <label className="block text-[10px] font-bold text-muted-foreground mb-1.5">
                    اسم الملف عند التصدير
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={customFileName}
                      onChange={(e) => setCustomFileName(e.target.value)}
                      placeholder="اسم الخط"
                      dir="ltr"
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
                    />
                    <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">
                      {fontFile.name.substring(fontFile.name.lastIndexOf('.')) || '.ttf'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* No features */}
            {fontFile && availableFeatures.length === 0 && axes.length === 0 && !isPyodideLoading && (
              <div className="glass-card p-3 flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">لم يتم العثور على خصائص أو محاور في هذا الخط.</p>
              </div>
            )}

            {/* Tabs */}
            {fontFile && (availableFeatures.length > 0 || axes.length > 0 || pinnedAxes.length > 0) && (
              <div className="flex gap-1 bg-muted/40 p-0.5 rounded-lg">
                {availableFeatures.length > 0 && (
                  <button
                    onClick={() => setActiveTab('features')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-[11px] font-bold transition-all ${
                      activeTab === 'features' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <CheckCircle className="w-3 h-3" />
                    خصائص ({availableFeatures.length})
                  </button>
                )}
                {(axes.length > 0 || pinnedAxes.length > 0) && (
                  <button
                    onClick={() => setActiveTab('axes')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-[11px] font-bold transition-all ${
                      activeTab === 'axes' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    محاور ({axes.length + pinnedAxes.length})
                  </button>
                )}
              </div>
            )}

            {/* Features panel */}
            {activeTab === 'features' && availableFeatures.length > 0 && (
              <div className="glass-card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">الخصائص</span>
                  <div className="flex gap-1">
                    <button onClick={selectAll} className="text-[10px] px-2 py-0.5 rounded font-medium text-primary bg-primary/8 hover:bg-primary/12 transition-colors">الكل</button>
                    <button onClick={deselectAll} className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded bg-muted/50 transition-colors">لا شيء</button>
                  </div>
                </div>

                {frozenFeatures.length > 0 && (
                  <div className="px-3 pt-2">
                    <button
                      onClick={handleResetToOriginal}
                      disabled={isProcessing}
                      className="w-full py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all border border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      إعادة الخط للأصل
                    </button>
                  </div>
                )}

                <div className="p-3">
                  <div className="grid grid-cols-2 gap-1 max-h-[280px] overflow-y-auto scrollbar-thin">
                    {availableFeatures.map(feat => {
                      const isSelected = selectedFeatures.includes(feat);
                      const isFrozen = frozenFeatures.includes(feat);
                      const willFreeze = isSelected && !isFrozen;
                      const willUnfreeze = !isSelected && isFrozen;

                      return (
                        <label
                          key={feat}
                          className={`flex items-center gap-1.5 p-2 rounded-md cursor-pointer transition-all text-xs select-none ${
                            isSelected ? 'bg-primary/[0.06] text-foreground' : 'hover:bg-muted/50'
                          }`}
                        >
                          <input type="checkbox" className="w-3 h-3 rounded cursor-pointer accent-primary" checked={isSelected} onChange={() => toggleFeature(feat)} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-mono font-bold text-[11px]">{feat}</span>
                              {isFrozen && <span className="text-[8px] px-1 py-px rounded bg-primary/10 text-primary">ON</span>}
                              {willFreeze && <span className="text-[8px] px-1 py-px rounded bg-success/10 text-success">+</span>}
                              {willUnfreeze && <span className="text-[8px] px-1 py-px rounded bg-destructive/10 text-destructive">-</span>}
                            </div>
                            {FEATURE_DESCRIPTIONS[feat] && (
                              <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">{FEATURE_DESCRIPTIONS[feat]}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {hasChanges && (
                    <div className="mt-2 p-2 rounded-md text-[10px] space-y-0.5 bg-muted/30 border border-border/40">
                      {featuresToFreeze.length > 0 && <p className="text-success"><b>+ تفعيل:</b> {featuresToFreeze.join(', ')}</p>}
                      {featuresToUnfreeze.length > 0 && <p className="text-destructive"><b>- إلغاء:</b> {featuresToUnfreeze.join(', ')}</p>}
                    </div>
                  )}

                  <button
                    onClick={handleProcessAndDownload}
                    disabled={!hasChanges || isProcessing}
                    className="mt-3 w-full py-2.5 disabled:opacity-35 disabled:cursor-not-allowed bg-primary text-primary-foreground rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all hover:brightness-110"
                  >
                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {isProcessing ? 'جاري المعالجة...' : hasChanges ? 'تطبيق وتحميل' : 'لا توجد تعديلات'}
                  </button>
                </div>
              </div>
            )}

            {/* Axes panel */}
            {activeTab === 'axes' && (axes.length > 0 || pinnedAxes.length > 0) && (
              <div className="glass-card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border/50">
                  <span className="text-xs font-bold text-foreground">المحاور المتغيرة</span>
                </div>

                <div className="p-3">
                  {pinnedAxes.length > 0 && (
                    <div className="mb-3">
                      <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Sliders className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">محاور مثبتة ({pinnedAxes.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                          {pinnedAxes.map(a => (
                            <span key={a.tag} className="text-[10px] px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 font-mono font-bold">
                              {a.tag} = {a.value}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={handleUnfreezeAxes}
                          disabled={isAxisProcessing}
                          className="w-full py-2 disabled:opacity-35 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                        >
                          {isAxisProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sliders className="w-3.5 h-3.5" />}
                          {isAxisProcessing ? 'جاري الاستعادة...' : 'استعادة المحاور المثبتة'}
                        </button>
                      </div>
                    </div>
                  )}

                  {axes.length > 0 && (
                    <>
                      <div className="space-y-2.5 max-h-[350px] overflow-y-auto scrollbar-thin">
                        {axes.map(axis => {
                          const isSelected = selectedAxesToFreeze.has(axis.tag);
                          const currentVal = axisValues[axis.tag] ?? axis.defaultValue;
                          const displayName = AXIS_NAMES[axis.tag] || axis.name;

                          return (
                            <div key={axis.tag} className={`p-3 rounded-lg border transition-all ${isSelected ? 'border-primary/20 bg-primary/[0.02]' : 'border-border/40 bg-muted/20'}`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input type="checkbox" className="w-3 h-3 rounded accent-primary cursor-pointer" checked={isSelected} onChange={() => toggleAxisFreeze(axis.tag)} />
                                  <span className="font-mono font-bold text-[11px] text-foreground">{axis.tag}</span>
                                  <span className="text-[10px] text-muted-foreground">{displayName}</span>
                                </label>
                                <input
                                  type="number"
                                  value={currentVal}
                                  min={axis.minValue}
                                  max={axis.maxValue}
                                  step={axis.tag === 'ital' || axis.tag === 'slnt' ? 1 : (axis.maxValue - axis.minValue) > 10 ? 1 : 0.1}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v)) setAxisValues(prev => ({ ...prev, [axis.tag]: Math.min(axis.maxValue, Math.max(axis.minValue, v)) }));
                                  }}
                                  className="w-16 text-center text-[11px] font-mono bg-muted border border-border rounded px-1.5 py-0.5 text-foreground"
                                />
                              </div>
                              <input
                                type="range"
                                min={axis.minValue} max={axis.maxValue}
                                step={axis.tag === 'ital' || axis.tag === 'slnt' ? 1 : (axis.maxValue - axis.minValue) > 10 ? 1 : 0.1}
                                value={currentVal}
                                onChange={(e) => setAxisValues(prev => ({ ...prev, [axis.tag]: parseFloat(e.target.value) }))}
                                className="w-full h-1 rounded-full appearance-none cursor-pointer accent-primary bg-muted"
                              />
                              <div className="flex justify-between mt-0.5 text-[9px] text-muted-foreground/60 font-mono">
                                <span>{axis.minValue}</span>
                                <span>افتراضي: {axis.defaultValue}</span>
                                <span>{axis.maxValue}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {hasAxisChanges && (
                        <div className="mt-2 p-2 rounded-md text-[10px] bg-muted/30 border border-border/40">
                          <p className="font-bold text-foreground mb-0.5">سيتم تثبيت:</p>
                          {Array.from(selectedAxesToFreeze).map(tag => (
                            <p key={tag} className="text-muted-foreground">• {tag} = {axisValues[tag]}</p>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={handleFreezeAxes}
                        disabled={!hasAxisChanges || isAxisProcessing}
                        className="mt-3 w-full py-2.5 disabled:opacity-35 disabled:cursor-not-allowed bg-primary text-primary-foreground rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all hover:brightness-110"
                      >
                        {isAxisProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        {isAxisProcessing ? 'جاري المعالجة...' : hasAxisChanges ? 'تثبيت وتحميل' : 'حدد محاور'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Main: Preview + Log (8 cols) */}
          <div className="lg:col-span-8 space-y-4">

            {/* Preview */}
            <div className="glass-card overflow-hidden">
              <div className="border-b border-border/50 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">المعاينة</span>
                  {selectedFeatures.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {selectedFeatures.length} خاصية
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">الحجم:</span>
                  <input type="range" min="16" max="80" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-20 accent-primary h-1" />
                  <span className="text-[10px] text-muted-foreground font-mono w-5">{fontSize}</span>
                </div>
              </div>

              <div className="p-4">
                {!fontUrl ? (
                  <div className="border border-border/50 rounded-lg p-6 min-h-[220px] overflow-auto bg-surface flex items-center justify-center">
                    <p className="text-muted-foreground/40 text-xs">ارفع خطاً لرؤية المعاينة</p>
                  </div>
                ) : (
                  <div
                    ref={previewRef}
                    className="preview-editable border border-border/50 rounded-lg p-6 min-h-[220px] overflow-auto bg-surface focus:outline-none focus:ring-1 focus:ring-primary/20 whitespace-pre-wrap break-words cursor-text text-foreground"
                    dir="auto"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => {
                      const el = e.currentTarget;
                      const text = el.textContent || '';
                      setPreviewText(text);
                      if (!text.trim()) {
                        el.innerHTML = '';
                      }
                    }}
                    style={getPreviewStyle()}
                    data-placeholder="اكتب هنا لتجربة الخط..."
                  />
                )}

                {selectedFeatures.length > 0 && fontUrl && (
                  <div className="mt-2 rounded-md p-2 overflow-x-auto bg-log-bg border border-log-border">
                    <p className="text-[10px] font-mono text-log-success" dir="ltr">
                      font-feature-settings: {selectedFeatures.map(f => `"${f}" 1`).join(', ')};
                    </p>
                  </div>
                )}

                {axes.length > 0 && fontUrl && (
                  <div className="mt-1.5 rounded-md p-2 overflow-x-auto bg-log-bg border border-log-border">
                    <p className="text-[10px] font-mono text-log-success" dir="ltr">
                      font-variation-settings: {Object.entries(axisValues).map(([t, v]) => `"${t}" ${v}`).join(', ')};
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Collapsible Operation Log */}
            <div className="rounded-xl overflow-hidden border border-log-border bg-log-bg">
              <button
                onClick={() => setLogOpen(!logOpen)}
                className="w-full px-4 py-2 flex items-center gap-2 hover:bg-log-border/20 transition-colors"
              >
                <Terminal className="w-3 h-3 text-log-success" />
                <span className="font-bold text-[11px] text-log-text">سجل العمليات</span>
                {logs.length > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-log-success/15 text-log-success font-medium">{logs.length}</span>
                )}
                <div className="mr-auto flex items-center gap-2">
                  {logOpen && (
                    <span onClick={(e) => { e.stopPropagation(); setLogs([]); }} className="text-[10px] text-log-text/40 hover:text-log-success transition-colors cursor-pointer">مسح</span>
                  )}
                  <ChevronDown className={`w-3 h-3 text-log-text/40 transition-transform ${logOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {logOpen && (
                <div ref={logRef} className="px-4 pb-3 max-h-[180px] overflow-y-auto font-mono text-[10px] space-y-0.5 scrollbar-thin border-t border-log-border" dir="auto">
                  {logs.length === 0 ? (
                    <p className="text-log-text/25 pt-2">لا توجد عمليات بعد...</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className={`leading-relaxed ${
                        log.type === 'success' ? 'text-log-success' :
                        log.type === 'error' ? 'text-log-error' : 'text-log-text'
                      }`}>
                        {log.text}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-border/40 mt-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="لوجو" className="w-7 h-7 object-contain" />
            <span className="text-[11px] text-muted-foreground">موقع الأوبن تايب V2</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <span>صنع بكل حب بواسطة</span>
            <a
              href="https://t.me/hamo_alfiqi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <span>د. محمد الفقي</span>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </a>
          </div>
          <span className="text-[10px] text-muted-foreground/40">خصوصية تامة — كل شيء يعمل في متصفحك</span>
        </div>
      </footer>
    </div>
  );
};

export default FontFreezer;
