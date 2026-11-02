'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Copy, Download, ExternalLink, FileText, ImagePlus, Loader2, LogOut, Plus, Search, Send, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { renderTextToXbmHex } from '@/lib/monochrome';

// Helper for client-side pixel-width text wrapping
function wrapText(ctx, text, maxWidth) {
  const chars = Array.from(text || '');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char === '\n') {
      lines.push(currentLine);
      currentLine = '';
      continue;
    }

    const testLine = currentLine + char;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && i > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines;
}

// ============================================================
// u8g2 Font Simulation (u8g2_font_unifont_t_korean2)
// ESP32 Arduino drawKoreanText() 로직을 그대로 재현:
//   - ASCII (0x20–0x7E)  : 8px 고정폭 (half-width)
//   - 한글 / 기타 유니코드 : 16px 고정폭 (full-width)
//   - 줄 나눔: maxWidth=124, x=2, baseline y=16, lineHeight=16
// ============================================================
function u8g2CharWidth(codePoint) {
  if (codePoint >= 0x20 && codePoint <= 0x7E) return 8; // ASCII half-width
  return 16; // Korean, CJK, etc. full-width
}

function u8g2TextWidth(text) {
  let w = 0;
  for (const ch of text) w += u8g2CharWidth(ch.codePointAt(0));
  return w;
}

// Arduino drawKoreanText()의 줄 나눔과 동일한 로직
function u8g2WrapText(text, maxWidth) {
  const lines = [];
  let currentLine = '';
  for (const char of Array.from(text || '')) {
    if (char === '\n') {
      lines.push(currentLine);
      currentLine = '';
      continue;
    }
    const testLine = currentLine + char;
    if (u8g2TextWidth(testLine) > maxWidth) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines;
}

// Client-side text to XBM Hex renderer (supports Korean, Vietnamese, any local font)
function renderTextToXbmHexClient(text, scale = 2, weight = 'normal', threshold = 140) {
  if (typeof window === 'undefined') return '0'.repeat(2048);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 128;
  tempCanvas.height = 64;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return '0'.repeat(2048);

  // Black background
  tempCtx.fillStyle = '#000000';
  tempCtx.fillRect(0, 0, 128, 64);

  // Text configuration
  tempCtx.fillStyle = '#ffffff';
  tempCtx.textBaseline = 'top';

  const fontSize = scale === 1 ? 8 : 16;
  // Use Noto Sans KR, Inter, and sans-serif fallback
  tempCtx.font = `${weight} ${fontSize}px 'Noto Sans KR', 'Inter', sans-serif`;

  // Split and wrap lines
  const rawLines = (text || '').split('\n');
  const lines = [];
  for (const rawLine of rawLines) {
    lines.push(...wrapText(tempCtx, rawLine, 128));
  }

  // Draw lines onto canvas
  const maxLines = scale === 1 ? 8 : 4;
  const linesToDraw = lines.slice(0, maxLines);
  for (let i = 0; i < linesToDraw.length; i++) {
    tempCtx.fillText(linesToDraw[i], 0, i * fontSize);
  }

  // Threshold image to 1-bit monochrome
  const imageData = tempCtx.getImageData(0, 0, 128, 64);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    // Set threshold to make thin pixel outlines solid white without bloating
    const val = gray > threshold ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  // Convert to XBM format (LSB-first)
  const buffer = new Uint8Array(1024);
  for (let y = 0; y < 64; y++) {
    for (let byteX = 0; byteX < 16; byteX++) {
      for (let bit = 0; bit < 8; bit++) {
        const x = byteX * 8 + bit;
        const imgIdx = (y * 128 + x) * 4;
        const pixelOn = data[imgIdx] > 127;
        if (pixelOn) {
          const byteIndex = y * 16 + byteX;
          buffer[byteIndex] |= (1 << bit);
        }
      }
    }
  }

  // Hex serialize
  let hexString = '';
  for (let i = 0; i < buffer.length; i++) {
    hexString += buffer[i].toString(16).padStart(2, '0');
  }
  return hexString.toUpperCase();
}

const STATUS_STYLES = {
  대기중: 'border-amber-300 bg-amber-50 text-amber-800',
  검토중: 'border-sky-300 bg-sky-50 text-sky-800',
  결제대기: 'border-signal/40 bg-signal/10 text-signal',
  결제완료: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  완료: 'border-border bg-muted text-foreground',
  반려: 'border-red-200 bg-red-50 text-red-700',
};
function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={cn('font-normal', STATUS_STYLES[status])}>{status}</Badge>
  );
}

export default function DashboardView({ initialQuotes, initialContacts, initialPortfolios }) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [contacts, setContacts] = useState(initialContacts);
  const [portfolios, setPortfolios] = useState(initialPortfolios || []);
  const [activeTab, setActiveTab] = useState('quotes'); // 'quotes', 'contacts', or 'portfolios'
  
  // Shared Files State
  const [sharedFiles, setSharedFiles] = useState([]);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [isShareUploading, setIsShareUploading] = useState(false);
  const [shareDragActive, setShareDragActive] = useState(false);
  const shareFileInputRef = useRef(null);
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [methodFilter, setMethodFilter] = useState('전체');
  
  // Selected Detail Item
  const [selectedItem, setSelectedItem] = useState(null); // { type: 'quote'|'contact'|'portfolio', data: {...} }
  const [modalStatus, setModalStatus] = useState('');
  const [modalNotes, setModalNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalAmount, setModalAmount] = useState('');
  const [isRequestingPayment, setIsRequestingPayment] = useState(false);

  // Portfolio Form State
  const [portfolioFormId, setPortfolioFormId] = useState(null);
  const [pFormTitle, setPFormTitle] = useState('');
  const [pFormCategorySelect, setPFormCategorySelect] = useState('시제품');
  const [pFormCategoryCustom, setPFormCategoryCustom] = useState('');
  const [pFormMaterial, setPFormMaterial] = useState('');
  const [pFormDuration, setPFormDuration] = useState('');
  const [pFormDescription, setPFormDescription] = useState('');
  const [pFormImageFile, setPFormImageFile] = useState(null);
  const [pFormPreviewUrl, setPFormPreviewUrl] = useState('');
  const [pFormExistingImage, setPFormExistingImage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const router = useRouter();

  // ESP32 Settings State
  const [esp32Message, setEsp32Message] = useState('');
  const [esp32FontScale, setEsp32FontScale] = useState('2');
  const [esp32DisplayMode, setEsp32DisplayMode] = useState('text'); // 'text' or 'image'
  const [esp32ImageHex, setEsp32ImageHex] = useState('');
  const [esp32TextHex, setEsp32TextHex] = useState('');
  const [settingsImageFile, setSettingsImageFile] = useState(null);
  const [settingsImagePreviewUrl, setSettingsImagePreviewUrl] = useState('');
  const [ditherMode, setDitherMode] = useState('dither'); // 'dither' or 'threshold'
  const [thresholdValue, setThresholdValue] = useState(128);
  const [invertColors, setInvertColors] = useState(false);
  const [isSettingsDragging, setIsSettingsDragging] = useState(false);
  const settingsFileInputRef = useRef(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const canvasRef = useRef(null);

  // Clean up settings image preview URL
  useEffect(() => {
    return () => {
      if (settingsImagePreviewUrl) {
        URL.revokeObjectURL(settingsImagePreviewUrl);
      }
    };
  }, [settingsImagePreviewUrl]);

  // Fetch settings when activeTab is 'settings'
  useEffect(() => {
    if (activeTab === 'settings') {
      const fetchSettings = async () => {
        try {
          const res = await fetch('/api/admin/settings');
          const data = await res.json();
          if (res.ok) {
            setEsp32Message(data.esp32_message || '');
            setEsp32FontScale(data.esp32_font_scale || '2');
            setEsp32DisplayMode(data.esp32_display_mode || 'text');
            setEsp32ImageHex(data.esp32_image_hex || '');
            setEsp32TextHex(data.esp32_text_hex || '');
          } else {
            console.error('Failed to fetch settings:', data.error);
          }
        } catch (err) {
          console.error('Error fetching settings:', err);
        }
      };
      fetchSettings();
    }
  }, [activeTab]);

  const fetchSharedFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/share');
      const data = await res.json();
      if (res.ok) {
        setSharedFiles(data);
      } else {
        console.error('Failed to fetch shared files:', data.error);
      }
    } catch (err) {
      console.error('Error fetching shared files:', err);
    } finally {
      setIsShareLoading(false);
    }
  }, []);

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab);
    setSearchQuery('');
    setStatusFilter('전체');
    setMethodFilter('전체');
    if (nextTab === 'share') {
      setIsShareLoading(true);
      fetchSharedFiles();
    }
  };

  const handleShareFileUpload = async (file) => {
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) { // 500MB
      toast('파일 크기는 500MB를 초과할 수 없습니다.');
      return;
    }

    setIsShareUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/share', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setSharedFiles((prev) => [data.file, ...prev]);
        toast(`파일이 성공적으로 업로드되었습니다.\n공유 코드: ${data.file.code}`);
      } else {
        toast(data.error || '업로드에 실패했습니다.');
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast('업로드 중 서버 오류가 발생했습니다.');
    } finally {
      setIsShareUploading(false);
    }
  };

  const handleShareFileDelete = async (code) => {
    if (!confirm('정말로 이 파일의 공유를 중단하고 영구 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/admin/share?code=${code}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (res.ok) {
        setSharedFiles((prev) => prev.filter((f) => f.code !== code));
        toast('공유가 중단되고 파일이 삭제되었습니다.');
      } else {
        toast(data.error || '삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('Delete error:', err);
      toast('삭제 중 서버 오류가 발생했습니다.');
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      // Always generate client-side hex for text mode (supports Korean, Vietnamese, etc.)
      // This hex will be stored in DB and served to ESP32 directly
      const scale = parseInt(esp32FontScale, 10) || 2;
      const generatedTextHex = esp32DisplayMode === 'text'
        ? renderTextToXbmHexClient(esp32Message, scale)
        : '';

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          esp32_message: esp32Message,
          esp32_font_scale: esp32FontScale,
          esp32_display_mode: esp32DisplayMode,
          esp32_image_hex: esp32ImageHex,
          esp32_text_hex: generatedTextHex
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '설정 저장 실패');
      }
      setEsp32TextHex(generatedTextHex);
      toast('설정이 성공적으로 저장되었습니다.');
    } catch (err) {
      toast('오류가 발생했습니다: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Helper to convert uploaded image to XBM Hex
  const processImage = (file, mode, thresholdVal, invert) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 128;
        tempCanvas.height = 64;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        // Clear with black
        tempCtx.fillStyle = '#000000';
        tempCtx.fillRect(0, 0, 128, 64);

        // Aspect ratio calculations (fit center)
        const imgRatio = img.width / img.height;
        const canvasRatio = 128 / 64;
        let drawWidth, drawHeight, drawX, drawY;

        if (imgRatio > canvasRatio) {
          drawWidth = 128;
          drawHeight = 128 / imgRatio;
          drawX = 0;
          drawY = (64 - drawHeight) / 2;
        } else {
          drawWidth = 64 * imgRatio;
          drawHeight = 64;
          drawX = (128 - drawWidth) / 2;
          drawY = 0;
        }

        tempCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        const imageData = tempCtx.getImageData(0, 0, 128, 64);
        const data = imageData.data;

        if (mode === 'dither') {
          // Floyd-Steinberg Dithering
          const grays = new Float32Array(128 * 64);
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            grays[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
          }

          for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 128; x++) {
              const idx = y * 128 + x;
              const oldVal = grays[idx];
              const newVal = oldVal < 128 ? 0 : 255;
              grays[idx] = newVal;

              const err = oldVal - newVal;
              if (x + 1 < 128) grays[idx + 1] += err * (7 / 16);
              if (y + 1 < 64) {
                if (x - 1 >= 0) grays[idx + 128 - 1] += err * (3 / 16);
                grays[idx + 128] += err * (5 / 16);
                if (x + 1 < 128) grays[idx + 128 + 1] += err * (1 / 16);
              }
            }
          }

          // Apply and invert if requested
          for (let i = 0; i < grays.length; i++) {
            let val = grays[i] < 128 ? 0 : 255;
            if (invert) {
              val = 255 - val;
            }
            const idx = i * 4;
            data[idx] = val;
            data[idx+1] = val;
            data[idx+2] = val;
          }
        } else {
          // Simple Threshold
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            let val = gray < thresholdVal ? 0 : 255;
            if (invert) {
              val = 255 - val;
            }
            data[i] = val;
            data[i+1] = val;
            data[i+2] = val;
          }
        }

        // Convert to XBM Hex
        const buffer = new Uint8Array(1024);
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 128; x++) {
            const imgIdx = (y * 128 + x) * 4;
            const r = data[imgIdx];
            if (r > 127) { // white pixel (ON)
              const byteIndex = y * 16 + Math.floor(x / 8);
              const bitIndex = x % 8;
              buffer[byteIndex] |= (1 << bitIndex);
            }
          }
        }

        // Convert buffer to hex
        let hexString = '';
        for (let i = 0; i < buffer.length; i++) {
          hexString += buffer[i].toString(16).padStart(2, '0');
        }
        setEsp32ImageHex(hexString.toUpperCase());
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Re-process image when configurations change
  useEffect(() => {
    if (activeTab === 'settings' && esp32DisplayMode === 'image' && settingsImageFile) {
      processImage(settingsImageFile, ditherMode, thresholdValue, invertColors);
    }
  }, [settingsImageFile, ditherMode, thresholdValue, invertColors, esp32DisplayMode, activeTab]);

  // Real-time OLED Canvas Preview
  useEffect(() => {
    if (activeTab !== 'settings') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear with pure black OLED background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
      let hex = '';
      if (esp32DisplayMode === 'image') {
        hex = esp32ImageHex || '0'.repeat(2048);
      } else {
        const scale = parseInt(esp32FontScale, 10) || 2;
        const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(esp32Message);
        if (hasKorean) {
          // ─── u8g2 정확 시뮬레이션 ───────────────────────────────────────
          // u8g2_font_unifont_t_korean2 기준:
          //   한글=16px, ASCII=8px 고정폭으로 줄 나눔 (measureText 미사용)
          // Arduino drawKoreanText() 파라미터:
          //   x=2, maxWidth=124, lineHeight=16, first baseline y=16
          // ────────────────────────────────────────────────────────────────
          ctx.fillStyle = '#00f0ff';
          ctx.textBaseline = 'alphabetic'; // u8g2 drawUTF8의 y는 baseline
          ctx.font = `500 14px 'Noto Sans KR', monospace`;

          // u8g2 로직과 동일한 줄 나눔
          const rawLines = (esp32Message || '').split('\n');
          const lines = [];
          for (const rawLine of rawLines) {
            lines.push(...u8g2WrapText(rawLine, 124)); // maxWidth=124
          }

          // u8g2: drawUTF8(2, 16, ...) → drawUTF8(2, 32, ...) → ...
          const linesToDraw = lines.slice(0, 4); // 64px / 16px = 4줄 최대
          for (let i = 0; i < linesToDraw.length; i++) {
            ctx.fillText(linesToDraw[i], 2, 16 + i * 16);
          }
          return; // XBM 픽셀 루프 건너뜀
        } else {
          hex = renderTextToXbmHex(esp32Message, scale);
        }
      }
      
      // XBM format convention: horizontal scan, LSB-first
      for (let y = 0; y < 64; y++) {
        for (let byteX = 0; byteX < 16; byteX++) {
          const byteIndex = y * 16 + byteX;
          const hexByte = hex.substring(byteIndex * 2, byteIndex * 2 + 2);
          const byteValue = parseInt(hexByte, 16) || 0;

          for (let bit = 0; bit < 8; bit++) {
            const pixelOn = (byteValue >> bit) & 1;
            const x = byteX * 8 + bit;
            
            if (pixelOn) {
              // Glowing OLED blue/cyan color
              ctx.fillStyle = '#00f0ff';
              ctx.fillRect(x, y, 1, 1);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error drawing OLED preview:', err);
    }
  }, [esp32Message, esp32FontScale, esp32DisplayMode, esp32ImageHex, activeTab]);

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url)
      .then(() => toast('주소가 클립보드에 복사되었습니다.'))
      .catch((err) => toast('복사에 실패했습니다: ' + err));
  };

  // Close Modal Handler
  const handleCloseModal = useCallback(() => {
    setSelectedItem(null);
    if (pFormPreviewUrl) {
      URL.revokeObjectURL(pFormPreviewUrl);
    }
    setPFormPreviewUrl('');
    setPFormImageFile(null);
  }, [pFormPreviewUrl]);

  // Open Modal Handler
  const handleOpenItem = (type, item) => {
    setSelectedItem({ type, data: item });
    setModalStatus(item.status || '대기중');
    setModalNotes(item.adminNotes || '');
    setModalAmount(item.amount ? String(item.amount) : '');
  };

  const handleOpenPortfolioForm = (item = null) => {
    if (item) {
      setPortfolioFormId(item.id);
      setPFormTitle(item.title);
      const isStandardCategory = ['시제품', '라이프스타일', '건축 모형', '산업 부품', '출력 공정', '디자인 소품'].includes(item.category);
      if (isStandardCategory) {
        setPFormCategorySelect(item.category);
        setPFormCategoryCustom('');
      } else {
        setPFormCategorySelect('custom');
        setPFormCategoryCustom(item.category);
      }
      setPFormMaterial(item.material);
      setPFormDuration(item.duration);
      setPFormDescription(item.description);
      setPFormExistingImage(item.image);
      setPFormImageFile(null);
      setPFormPreviewUrl('');
    } else {
      setPortfolioFormId(null);
      setPFormTitle('');
      setPFormCategorySelect('시제품');
      setPFormCategoryCustom('');
      setPFormMaterial('');
      setPFormDuration('');
      setPFormDescription('');
      setPFormExistingImage('');
      setPFormImageFile(null);
      setPFormPreviewUrl('');
    }
    setSelectedItem({ type: 'portfolio', data: item || {} });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast('이미지 파일 크기는 10MB를 초과할 수 없습니다.');
        return;
      }
      setPFormImageFile(file);
      const preview = URL.createObjectURL(file);
      setPFormPreviewUrl(preview);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast('이미지 파일만 업로드할 수 있습니다.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast('이미지 파일 크기는 10MB를 초과할 수 없습니다.');
        return;
      }
      setPFormImageFile(file);
      const preview = URL.createObjectURL(file);
      setPFormPreviewUrl(preview);
    }
  };

  const handleRemovePreviewImage = () => {
    if (pFormPreviewUrl) {
      URL.revokeObjectURL(pFormPreviewUrl);
    }
    setPFormPreviewUrl('');
    setPFormImageFile(null);
    setPFormExistingImage('');
  };

  const handleCategorySelectChange = (value) => {
    setPFormCategorySelect(value);
    if (value !== 'custom') {
      setPFormCategoryCustom('');
    }
  };

  const handleSavePortfolioForm = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    const category = pFormCategorySelect === 'custom' ? pFormCategoryCustom : pFormCategorySelect;
    
    const formData = new FormData();
    formData.append('title', pFormTitle);
    formData.append('category', category);
    formData.append('material', pFormMaterial);
    formData.append('duration', pFormDuration);
    formData.append('description', pFormDescription);
    
    if (portfolioFormId) {
      formData.append('id', portfolioFormId);
    }
    if (pFormImageFile) {
      formData.append('image', pFormImageFile);
    }
    
    const method = portfolioFormId ? 'PUT' : 'POST';
    const url = '/api/admin/portfolio';
    
    try {
      const res = await fetch(url, {
        method,
        body: formData,
      });
      
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || '저장 실패');
      }
      
      const savedItem = resData.portfolio;
      
      if (portfolioFormId) {
        setPortfolios(portfolios.map((p) => p.id === portfolioFormId ? savedItem : p));
        toast('포트폴리오가 수정되었습니다.');
      } else {
        setPortfolios([savedItem, ...portfolios]);
        toast('포트폴리오가 새로 등록되었습니다.');
      }
      
      handleCloseModal();
    } catch (err) {
      toast('오류가 발생했습니다: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePortfolio = async (id) => {
    if (!confirm('정말로 이 포트폴리오를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/admin/portfolio?id=${id}`, {
        method: 'DELETE',
      });
      
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || '삭제 실패');
      }
      
      setPortfolios(portfolios.filter((p) => p.id !== id));
      toast('포트폴리오가 삭제되었습니다.');
    } catch (err) {
      toast('삭제 중 오류가 발생했습니다: ' + err.message);
    }
  };

  // Logout Handler
  const handleLogout = async () => {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch (err) {
      toast('로그아웃 실패: ' + err.message);
    }
  };

  // Save Modal updates (Status/Notes)
  const handleSaveModal = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;
    
    setIsSaving(true);
    const { type, data } = selectedItem;
    const url = `/api/admin/${type === 'quote' ? 'quotes' : 'contacts'}`;

    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: data.id,
          status: modalStatus,
          adminNotes: modalNotes,
          amount: type === 'quote' && modalAmount ? Number(modalAmount) : undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || '상태 업데이트 실패');
      }

      const updatedItem = await res.json();

      // Update local state
      if (type === 'quote') {
        setQuotes(quotes.map((q) => (q.id === data.id ? updatedItem : q)));
      } else {
        setContacts(contacts.map((c) => (c.id === data.id ? updatedItem : c)));
      }

      // Update selected item data view
      setSelectedItem({ type, data: updatedItem });
      toast('저장 완료되었습니다.');
      handleCloseModal();
    } catch (err) {
      toast('오류가 발생했습니다: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Saves the amount, marks the quote 결제대기 and emails the customer a pay link
  const handleRequestPayment = async () => {
    if (!selectedItem || selectedItem.type !== 'quote') return;
    const amount = Number(modalAmount);
    if (!Number.isInteger(amount) || amount < 100) {
      toast.error('결제 금액을 100원 이상 정수로 입력해 주세요.');
      return;
    }
    if (!confirm(`${amount.toLocaleString()}원 결제 요청 메일을 ${selectedItem.data.email}로 보낼까요?`)) return;

    setIsRequestingPayment(true);
    try {
      const res = await fetch('/api/admin/quotes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedItem.data.id, amount, adminNotes: modalNotes, requestPayment: true }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || '결제 요청 실패');
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      setSelectedItem({ type: 'quote', data: updated });
      setModalStatus(updated.status);
      toast.success('결제 요청을 보냈습니다.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsRequestingPayment(false);
    }
  };

  // Stats Counters
  const totalQuotes = quotes.length;
  const pendingQuotes = quotes.filter((q) => q.status === '대기중').length;
  const awaitingPayment = quotes.filter((q) => q.status === '결제대기').length;
  const paidQuotes = quotes.filter((q) => q.status === '결제완료');
  const paidTotal = paidQuotes.reduce((sum, q) => sum + (q.amount || 0), 0);
  const totalContacts = contacts.length;
  const pendingContacts = contacts.filter((c) => c.status === '대기중').length;
  const totalPortfolios = portfolios.length;

  // Filtering Logic
  const filteredPortfolios = portfolios.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.material.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });
  const filteredQuotes = quotes.filter((q) => {
    const matchesSearch =
      q.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.phone.includes(searchQuery) ||
      (q.description && q.description.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesStatus = statusFilter === '전체' || q.status === statusFilter;
    const matchesMethod = methodFilter === '전체' || q.method === methodFilter;

    return matchesSearch && matchesStatus && matchesMethod;
  });

  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.message && c.message.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === '전체' || c.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Formatting Date
  const formatDate = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // Format File Size
  const formatSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const SECTIONS = {
    quotes: ['견적 요청', '고객 견적 접수 내역과 결제 요청을 관리합니다.'],
    contacts: ['일반 문의', '문의 양식으로 들어온 내역입니다.'],
    portfolios: ['포트폴리오', '홈페이지 포트폴리오 작업물을 관리합니다.'],
    share: ['파일 공유', '파일을 올리면 7일간 유효한 공유 코드가 만들어집니다.'],
    settings: ['ESP32 설정', 'OLED 단말기 메시지와 이미지를 관리합니다.'],
  };

  const STATS = [
    ['견적 요청', `${totalQuotes}`],
    ['대기중', `${pendingQuotes}`],
    ['결제대기', `${awaitingPayment}`],
    ['결제완료', `${paidQuotes.length}`, `₩${paidTotal.toLocaleString()}`],
    ['일반 문의', `${totalContacts}`, `${pendingContacts} 대기`],
  ];

  const quote = selectedItem?.type === 'quote' ? selectedItem.data : null;
  const payUrl = quote && typeof window !== 'undefined' ? `${window.location.origin}/pay/${quote.id}` : '';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">김명규크리에이티브</span>
            <span className="font-mono text-[11px] text-muted-foreground">ADMIN</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut /> 로그아웃
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-8">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="-mx-5 overflow-x-auto px-5">
            <TabsList>
              <TabsTrigger value="quotes">견적 요청</TabsTrigger>
              <TabsTrigger value="contacts">일반 문의</TabsTrigger>
              <TabsTrigger value="portfolios">포트폴리오 <span className="font-mono text-[11px] text-muted-foreground">{totalPortfolios}</span></TabsTrigger>
              <TabsTrigger value="share">파일 공유</TabsTrigger>
              <TabsTrigger value="settings">ESP32</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{SECTIONS[activeTab][0]}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{SECTIONS[activeTab][1]}</p>
          </div>
        </div>

        {(activeTab === 'quotes' || activeTab === 'contacts') && (
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-5">
            {STATS.map(([label, value, sub]) => (
              <div key={label} className="bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-xl">{value}</span>
                  {sub && <span className="font-mono text-[11px] text-muted-foreground">{sub}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {activeTab !== 'settings' && activeTab !== 'share' && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={activeTab === 'portfolios' ? '제목, 카테고리, 소재 검색' : '이름, 이메일, 전화번호 검색'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-card pl-9"
                />
              </div>
              {activeTab === 'portfolios' ? (
                <Button onClick={() => handleOpenPortfolioForm(null)}>
                  <Plus /> 새 포트폴리오
                </Button>
              ) : (
                <>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36 bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="전체">전체 상태</SelectItem>
                      {(activeTab === 'quotes' ? ['대기중', '검토중', '결제대기', '결제완료', '완료', '반려'] : ['대기중', '검토중', '완료', '반려']).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeTab === 'quotes' && (
                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                      <SelectTrigger className="w-36 bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="전체">전체 방식</SelectItem>
                        {['SLA/DLP', 'FDM', 'SLS', '기타', '모름'].map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </>
              )}
            </div>

            <div className="mt-4 overflow-hidden rounded-md border bg-card">
              {activeTab === 'quotes' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>접수 일시</TableHead>
                      <TableHead>신청자</TableHead>
                      <TableHead>연락처</TableHead>
                      <TableHead>출력 정보</TableHead>
                      <TableHead>납기일</TableHead>
                      <TableHead className="text-right">금액</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotes.length > 0 ? (
                      filteredQuotes.map((q) => (
                        <TableRow key={q.id} className="cursor-pointer" onClick={() => handleOpenItem('quote', q)}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(q.createdAt)}</TableCell>
                          <TableCell className="font-medium">{q.name}</TableCell>
                          <TableCell>
                            <div className="text-sm">{q.phone}</div>
                            <div className="text-xs text-muted-foreground">{q.email}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{q.method || '미지정'}</div>
                            <div className="text-xs text-muted-foreground">{q.material || '소재 미지정'} · {q.quantity}개</div>
                          </TableCell>
                          <TableCell className="text-sm">{q.deadline || '무관'}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{q.amount ? `₩${q.amount.toLocaleString()}` : '—'}</TableCell>
                          <TableCell><StatusBadge status={q.status} /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">검색 조건에 맞는 견적 요청이 없습니다.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : activeTab === 'contacts' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>접수 일시</TableHead>
                      <TableHead>문의자</TableHead>
                      <TableHead>이메일</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>문의 내용</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.length > 0 ? (
                      filteredContacts.map((c) => (
                        <TableRow key={c.id} className="cursor-pointer" onClick={() => handleOpenItem('contact', c)}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-sm">{c.email}</TableCell>
                          <TableCell><Badge variant="secondary" className="font-normal">{c.type || '—'}</Badge></TableCell>
                          <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">{c.message}</TableCell>
                          <TableCell><StatusBadge status={c.status} /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">검색 조건에 맞는 문의 사항이 없습니다.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">이미지</TableHead>
                      <TableHead>프로젝트명</TableHead>
                      <TableHead>카테고리</TableHead>
                      <TableHead>소재</TableHead>
                      <TableHead>제작 기간</TableHead>
                      <TableHead className="text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPortfolios.length > 0 ? (
                      filteredPortfolios.map((p) => (
                        <TableRow key={p.id} className="cursor-pointer" onClick={() => handleOpenPortfolioForm(p)}>
                          <TableCell>
                            <Image
                              src={(Array.isArray(p.image) ? p.image[0] : p.image) || '/images/hero-bg.png'}
                              alt={p.title}
                              width={56}
                              height={56}
                              className="size-14 rounded-sm object-cover"
                            />
                          </TableCell>
                          <TableCell className="font-medium">{p.title}</TableCell>
                          <TableCell><Badge variant="secondary" className="font-normal">{p.category}</Badge></TableCell>
                          <TableCell className="text-sm">{p.material}</TableCell>
                          <TableCell className="text-sm">{p.duration}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenPortfolioForm(p)}>수정</Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleDeletePortfolio(p.id)} aria-label="삭제">
                              <Trash2 className="text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">검색 조건에 맞는 포트폴리오 작업물이 없습니다.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}

        {activeTab === 'share' && (
          <div className="mt-6 space-y-6">
            <button
              type="button"
              disabled={isShareUploading}
              onDragOver={(e) => { e.preventDefault(); setShareDragActive(true); }}
              onDragLeave={() => setShareDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setShareDragActive(false);
                handleShareFileUpload(e.dataTransfer.files?.[0]);
              }}
              onClick={() => shareFileInputRef.current?.click()}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-card py-12 text-center transition-colors hover:border-foreground',
                shareDragActive && 'border-foreground bg-muted',
                isShareUploading && 'cursor-wait'
              )}
            >
              {isShareUploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5 text-muted-foreground" />}
              <span className="text-sm font-medium">{isShareUploading ? '업로드 중입니다. 창을 닫지 마세요.' : '공유할 파일을 끌어다 놓거나 클릭해서 선택'}</span>
              <span className="font-mono text-[11px] text-muted-foreground">최대 500MB · 받는 쪽은 kimcre.shop/share 에서 코드 입력</span>
            </button>
            <input type="file" ref={shareFileInputRef} className="hidden" onChange={(e) => handleShareFileUpload(e.target.files?.[0])} />

            <div className="overflow-hidden rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[38%]">파일명</TableHead>
                    <TableHead>크기</TableHead>
                    <TableHead>공유 코드</TableHead>
                    <TableHead>업로드</TableHead>
                    <TableHead>남은 기한</TableHead>
                    <TableHead className="text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isShareLoading ? (
                    <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">불러오는 중…</TableCell></TableRow>
                  ) : sharedFiles.length > 0 ? (
                    sharedFiles.map((file) => {
                      const remainingMs = new Date(file.expiresAt) - new Date();
                      const isExpired = remainingMs <= 0;
                      const days = Math.floor(remainingMs / 86400000);
                      const hours = Math.floor((remainingMs % 86400000) / 3600000);
                      const remainingStr = isExpired ? '만료됨' : days > 0 ? `${days}일 ${hours}시간` : `${hours}시간`;
                      const shareUrl = `${window.location.origin}/share/${file.code}`;
                      return (
                        <TableRow key={file.code}>
                          <TableCell className="font-medium break-all whitespace-normal">{file.fileName}</TableCell>
                          <TableCell className="font-mono text-xs">{formatSize(file.fileSize)}</TableCell>
                          <TableCell className="font-mono text-sm">{file.code}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(file.createdAt)}</TableCell>
                          <TableCell className={cn('text-sm', isExpired ? 'text-destructive' : 'text-signal')}>{remainingStr}</TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="icon-sm" aria-label="다운로드">
                              <a href={`/api/share/${file.code}?download=true`}><Download /></a>
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleCopyUrl(shareUrl)} aria-label="링크 복사"><Copy /></Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleShareFileDelete(file.code)} aria-label="삭제">
                              <Trash2 className="text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">공유 중인 파일이 없습니다.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-5 rounded-md border bg-card p-6">
                <Tabs value={esp32DisplayMode} onValueChange={setEsp32DisplayMode}>
                  <TabsList className="w-full">
                    <TabsTrigger value="text">텍스트</TabsTrigger>
                    <TabsTrigger value="image">이미지</TabsTrigger>
                  </TabsList>
                </Tabs>

                {esp32DisplayMode === 'text' ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="esp32_message">출력 메시지</Label>
                      <Textarea
                        id="esp32_message"
                        rows={5}
                        className="font-mono"
                        value={esp32Message}
                        onChange={(e) => setEsp32Message(e.target.value)}
                        placeholder="ESP32 화면에 출력할 텍스트"
                        disabled={savingSettings}
                      />
                      <p className="text-xs text-muted-foreground">한글·베트남어 성조도 OLED 폰트로 합성됩니다.</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="esp32_font_scale">글자 크기</Label>
                      <Select value={esp32FontScale} onValueChange={setEsp32FontScale} disabled={savingSettings}>
                        <SelectTrigger id="esp32_font_scale" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1x — 8×8, 줄당 16자, 최대 8줄</SelectItem>
                          <SelectItem value="2">2x — 16×16, 줄당 8자, 최대 4줄</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      type="file"
                      ref={settingsFileInputRef}
                      className="hidden"
                      accept="image/png, image/jpeg, image/jpg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSettingsImageFile(file);
                          setSettingsImagePreviewUrl(URL.createObjectURL(file));
                        }
                      }}
                    />
                    {settingsImagePreviewUrl ? (
                      <div className="flex flex-col items-center gap-3 rounded-md border p-4">
                        <Image src={settingsImagePreviewUrl} alt="업로드 미리보기" width={160} height={120} unoptimized className="max-h-[120px] w-auto object-contain" />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSettingsImageFile(null);
                            setSettingsImagePreviewUrl('');
                            setEsp32ImageHex('');
                          }}
                        >
                          이미지 제거
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => settingsFileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setIsSettingsDragging(true); }}
                        onDragLeave={() => setIsSettingsDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsSettingsDragging(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file && file.type.startsWith('image/')) {
                            setSettingsImageFile(file);
                            setSettingsImagePreviewUrl(URL.createObjectURL(file));
                          }
                        }}
                        className={cn(
                          'flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-input py-10 text-center hover:border-foreground',
                          isSettingsDragging && 'border-foreground bg-muted'
                        )}
                      >
                        <ImagePlus className="size-5 text-muted-foreground" />
                        <span className="text-sm font-medium">{esp32ImageHex ? '서버에 저장된 이미지 출력 중 — 새 이미지로 변경' : '이미지를 끌어다 놓거나 클릭해서 선택'}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">PNG · JPG → 128×64 자동 변환</span>
                      </button>
                    )}

                    {(settingsImagePreviewUrl || esp32ImageHex) && (
                      <div className="space-y-4 rounded-md bg-muted/60 p-4">
                        <div className="grid gap-2">
                          <Label htmlFor="dither_mode">변환 필터</Label>
                          <Select value={ditherMode} onValueChange={setDitherMode}>
                            <SelectTrigger id="dither_mode" className="w-full bg-card"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dither">오차 확산 디더링 (사진)</SelectItem>
                              <SelectItem value="threshold">임계값 (로고·선화)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {ditherMode === 'threshold' && (
                          <div className="grid gap-2">
                            <div className="flex justify-between">
                              <Label htmlFor="threshold_range">임계값</Label>
                              <span className="font-mono text-xs">{thresholdValue}</span>
                            </div>
                            <input
                              id="threshold_range"
                              type="range"
                              min="0"
                              max="255"
                              value={thresholdValue}
                              onChange={(e) => setThresholdValue(parseInt(e.target.value, 10))}
                              className="w-full accent-foreground"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Checkbox id="invert_checkbox" checked={invertColors} onCheckedChange={(v) => setInvertColors(v === true)} />
                          <Label htmlFor="invert_checkbox" className="font-normal">흑백 반전</Label>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <Button onClick={handleSaveSettings} disabled={savingSettings}>
                  {savingSettings ? <><Loader2 className="animate-spin" /> 저장 중</> : '설정 저장'}
                </Button>
              </div>

              <div className="rounded-md border bg-card p-6">
                <p className="text-sm font-medium">실시간 미리보기</p>
                <p className="mt-1 text-xs text-muted-foreground">SSD1306 OLED 128×64에 출력되는 모습입니다.</p>
                <div className="mt-6 rounded-lg bg-[#111] p-5">
                  <p className="font-mono text-[10px] text-white/40">SSD1306 128×64</p>
                  <canvas
                    ref={canvasRef}
                    width={128}
                    height={64}
                    className="mt-3 aspect-[2/1] w-full rounded-sm bg-black [image-rendering:pixelated]"
                  />
                  <div className="mt-3 flex justify-between font-mono text-[10px] text-white/30">
                    <span>GND</span><span>VCC</span><span>SCL</span><span>SDA</span>
                  </div>
                </div>
                <div className="mt-4 flex justify-between font-mono text-[11px] text-muted-foreground">
                  <span>128 × 64 px</span>
                  <span>{esp32FontScale}x ({esp32FontScale === '1' ? '16자 × 8줄' : '8자 × 4줄'})</span>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-card p-6">
              <p className="text-sm font-medium">API 엔드포인트</p>
              <p className="mt-1 text-xs text-muted-foreground">ESP32에서 아래 주소로 HTTP GET 요청을 보냅니다.</p>
              <div className="mt-4 divide-y border-y">
                {[
                  ['https://kimcre.shop/api/message', '기본 — text/plain, 128×64 화면용 2,048자 XBM Hex'],
                  ['https://kimcre.shop/api/message?format=json', '{"message": 원본 텍스트, "hex": 2048자 Hex}'],
                  ['https://kimcre.shop/api/message?format=text', '디버깅용 원본 텍스트'],
                ].map(([url, desc]) => (
                  <div key={url} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <code className="font-mono text-[13px]"><span className="text-muted-foreground">GET</span> {url}</code>
                      <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleCopyUrl(url)}><Copy /> 복사</Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && handleCloseModal()}>
        {selectedItem?.type === 'portfolio' ? (
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
            <form onSubmit={handleSavePortfolioForm} className="grid gap-5">
              <DialogHeader>
                <DialogTitle>{portfolioFormId ? '포트폴리오 수정' : '새 포트폴리오'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="p-title">프로젝트명</Label>
                <Input id="p-title" value={pFormTitle} onChange={(e) => setPFormTitle(e.target.value)} placeholder="예: 로켓 엔진 노즐 정밀 시제품" required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="p-category-select">카테고리</Label>
                  <Select value={pFormCategorySelect} onValueChange={handleCategorySelectChange}>
                    <SelectTrigger id="p-category-select" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['시제품', '라이프스타일', '건축 모형', '산업 부품', '출력 공정', '디자인 소품'].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      <SelectItem value="custom">직접 입력…</SelectItem>
                    </SelectContent>
                  </Select>
                  {pFormCategorySelect === 'custom' && (
                    <Input value={pFormCategoryCustom} onChange={(e) => setPFormCategoryCustom(e.target.value)} placeholder="카테고리명" required />
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-duration">제작 기간</Label>
                  <Input id="p-duration" value={pFormDuration} onChange={(e) => setPFormDuration(e.target.value)} placeholder="예: 2일" required />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-material">출력 소재</Label>
                <Input id="p-material" value={pFormMaterial} onChange={(e) => setPFormMaterial(e.target.value)} placeholder="예: PETG-CF / ABS" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-description">상세 설명</Label>
                <Textarea id="p-description" rows={4} value={pFormDescription} onChange={(e) => setPFormDescription(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label>이미지</Label>
                {(pFormPreviewUrl || pFormExistingImage) ? (
                  <div className="space-y-2">
                    <Image
                      src={pFormPreviewUrl || (Array.isArray(pFormExistingImage) ? pFormExistingImage[0] : pFormExistingImage)}
                      alt="미리보기"
                      width={640}
                      height={360}
                      unoptimized={Boolean(pFormPreviewUrl)}
                      className="aspect-video w-full rounded-md object-cover"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handleRemovePreviewImage}>이미지 변경</Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-md border border-dashed border-input py-10 text-center hover:border-foreground',
                      isDragging && 'border-foreground bg-muted'
                    )}
                  >
                    <ImagePlus className="size-5 text-muted-foreground" />
                    <span className="text-sm font-medium">이미지를 끌어다 놓거나 클릭해서 선택</span>
                    <span className="font-mono text-[11px] text-muted-foreground">PNG · JPG — 최대 10MB</span>
                  </button>
                )}
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg, image/jpg" className="hidden" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseModal}>취소</Button>
                <Button type="submit" disabled={isSaving || (!portfolioFormId && !pFormImageFile)}>
                  {isSaving ? <><Loader2 className="animate-spin" /> 저장 중</> : '저장'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : selectedItem ? (
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{selectedItem.type === 'quote' ? '견적 요청' : '일반 문의'} — {selectedItem.data.name}</DialogTitle>
              <DialogDescription className="font-mono text-xs">{formatDate(selectedItem.data.createdAt)} · {selectedItem.data.id}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-8 md:grid-cols-5">
              <div className="space-y-6 md:col-span-3">
                <dl className="divide-y border-y text-sm">
                  {[
                    ['연락처', selectedItem.data.phone],
                    ['이메일', selectedItem.data.email],
                    ...(selectedItem.type === 'quote'
                      ? [
                          ['출력 방식', selectedItem.data.method || '미지정'],
                          ['소재', selectedItem.data.material || '미지정'],
                          ['수량', `${selectedItem.data.quantity}개`],
                          ['희망 납기일', selectedItem.data.deadline || '무관'],
                        ]
                      : [['문의 유형', selectedItem.data.type || '—']]),
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-2.5">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-right">{v}</dd>
                      </div>
                    ))}
                </dl>
                <div>
                  <p className="kicker">{selectedItem.type === 'quote' ? '설명' : '문의 본문'}</p>
                  <div className="mt-2 rounded-md bg-muted/60 p-4 text-sm whitespace-pre-wrap">
                    {selectedItem.type === 'quote' ? selectedItem.data.description : selectedItem.data.message}
                  </div>
                </div>
                {selectedItem.type === 'quote' && (
                  <div>
                    <p className="kicker">첨부파일</p>
                    {selectedItem.data.file ? (
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-md border p-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{selectedItem.data.file.name}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{formatSize(selectedItem.data.file.size)}</p>
                          </div>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <a href={`/api/admin/files/${selectedItem.data.id}`} target="_blank" rel="noopener noreferrer"><Download /> 다운로드</a>
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">첨부된 파일이 없습니다.</p>
                    )}
                  </div>
                )}
              </div>

              <form onSubmit={handleSaveModal} className="space-y-5 md:col-span-2">
                {quote && (
                  <div className="space-y-3 rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">결제</p>
                      {(quote.status === '결제대기' || quote.status === '결제완료') && <StatusBadge status={quote.status} />}
                    </div>
                    {quote.status === '결제완료' ? (
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-muted-foreground">결제 금액</dt><dd className="font-mono">₩{quote.amount?.toLocaleString()}</dd></div>
                        <div className="flex justify-between"><dt className="text-muted-foreground">결제 일시</dt><dd className="font-mono text-xs">{formatDate(quote.paidAt)}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">결제 키</dt><dd className="truncate font-mono text-[11px]">{quote.paymentKey}</dd></div>
                      </dl>
                    ) : (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="admin-amount">견적 금액 (원)</Label>
                          <Input
                            id="admin-amount"
                            type="number"
                            min="100"
                            max="10000000"
                            step="1"
                            inputMode="numeric"
                            className="font-mono"
                            value={modalAmount}
                            onChange={(e) => setModalAmount(e.target.value)}
                            placeholder="예: 85000"
                          />
                          {modalAmount && <p className="font-mono text-[11px] text-muted-foreground">₩{Number(modalAmount).toLocaleString()}</p>}
                        </div>
                        <Button type="button" className="w-full" onClick={handleRequestPayment} disabled={isRequestingPayment || !modalAmount}>
                          {isRequestingPayment ? <Loader2 className="animate-spin" /> : <Send />}
                          {quote.status === '결제대기' ? '결제 요청 다시 보내기' : '결제 요청 보내기'}
                        </Button>
                      </>
                    )}
                    {(quote.status === '결제대기' || quote.status === '결제완료') && (
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => handleCopyUrl(payUrl)}><Copy /> 결제 링크 복사</Button>
                        <Button asChild variant="outline" size="icon-sm">
                          <a href={payUrl} target="_blank" rel="noopener noreferrer" aria-label="결제 페이지 열기"><ExternalLink /></a>
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="admin-status-select">처리 상태</Label>
                  <Select value={modalStatus} onValueChange={setModalStatus}>
                    <SelectTrigger id="admin-status-select" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(selectedItem.type === 'quote' ? ['대기중', '검토중', '결제대기', '결제완료', '완료', '반려'] : ['대기중', '검토중', '완료', '반려']).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-notes-textarea">관리 메모</Label>
                  <Textarea
                    id="admin-notes-textarea"
                    rows={5}
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="내부 기록용 메모 (예: 6/13 유선 통화로 견적 안내)"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCloseModal}>닫기</Button>
                  <Button type="submit" disabled={isSaving}>{isSaving ? <><Loader2 className="animate-spin" /> 저장 중</> : '저장'}</Button>
                </div>
              </form>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
