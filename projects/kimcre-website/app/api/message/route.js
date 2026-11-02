import { NextResponse } from 'next/server';
import { getSystemSetting } from '@/lib/db';
import { renderTextToXbmHex } from '@/lib/monochrome';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');
    const queryScale = searchParams.get('scale');
    
    const message = await getSystemSetting('esp32_message', 'Welcome to kimcre.shop!');
    const displayMode = await getSystemSetting('esp32_display_mode', 'text');
    const imageHex = await getSystemSetting('esp32_image_hex', '');
    
    // Retrieve scale from query param or fallback to database setting (default: 2)
    const dbScale = await getSystemSetting('esp32_font_scale', '2');
    const scaleVal = queryScale ? parseInt(queryScale, 10) : parseInt(dbScale, 10);
    const scale = (scaleVal === 1 || scaleVal === 2) ? scaleVal : 2;

    // Korean text detection: ESP32 renders Korean natively with u8g2 font (sharper output)
    // Non-Korean uses server-side XBM hex bitmap rendering
    const hasKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(message);

    // Return raw UTF-8 for: debug formats, OR Korean text mode (ESP32 native font rendering)
    if (format === 'text' || format === 'raw' || (displayMode === 'text' && hasKorean)) {
      return new Response(message, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    // Non-Korean: return 2048-char XBM hex bitmap
    async function getHexResponse() {
      if (displayMode === 'image' && imageHex && imageHex.length === 2048) {
        return imageHex;
      }
      return renderTextToXbmHex(message, scale);
    }

    const hex = await getHexResponse();

    // JSON format support for extensibility
    if (format === 'json') {
      return NextResponse.json(
        { message, scale, displayMode, hex },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    // Default: 2,048-character Hex string representing XBM format byte array
    return new Response(hex, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Failed to get ESP32 message:', error);
    
    // In case of error, return a blank 2,048 Hex string so ESP32 parser doesn't crash on invalid length
    const blankHex = '0'.repeat(2048);
    return new Response(blankHex, {
      status: 500,
      headers: { 
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  }
}

