import { NextResponse } from 'next/server';
import { getSystemSetting, setSystemSetting } from '@/lib/db';
import { verifyAdminToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function checkAuth(request) {
  const token = request.cookies.get('admin_session')?.value;
  return verifyAdminToken(token);
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const esp32Message = await getSystemSetting('esp32_message', 'Welcome to kimcre.shop!');
    const esp32FontScale = await getSystemSetting('esp32_font_scale', '2');
    const esp32DisplayMode = await getSystemSetting('esp32_display_mode', 'text');
    const esp32ImageHex = await getSystemSetting('esp32_image_hex', '');
    const esp32TextHex = await getSystemSetting('esp32_text_hex', '');
    const esp32TextWeight = await getSystemSetting('esp32_text_weight', 'normal');
    const esp32TextThreshold = await getSystemSetting('esp32_text_threshold', '140');
    return NextResponse.json({ 
      esp32_message: esp32Message,
      esp32_font_scale: esp32FontScale,
      esp32_display_mode: esp32DisplayMode,
      esp32_image_hex: esp32ImageHex,
      esp32_text_hex: esp32TextHex,
      esp32_text_weight: esp32TextWeight,
      esp32_text_threshold: esp32TextThreshold
    });
  } catch (error) {
    console.error('Failed to get system settings:', error);
    return NextResponse.json(
      { error: '설정을 가져오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { esp32_message, esp32_font_scale, esp32_display_mode, esp32_image_hex, esp32_text_hex, esp32_text_weight, esp32_text_threshold } = body;

    if (esp32_message !== undefined) {
      await setSystemSetting('esp32_message', esp32_message);
    }
    if (esp32_font_scale !== undefined) {
      await setSystemSetting('esp32_font_scale', esp32_font_scale.toString());
    }
    if (esp32_display_mode !== undefined) {
      await setSystemSetting('esp32_display_mode', esp32_display_mode);
    }
    if (esp32_image_hex !== undefined) {
      await setSystemSetting('esp32_image_hex', esp32_image_hex);
    }
    if (esp32_text_hex !== undefined) {
      await setSystemSetting('esp32_text_hex', esp32_text_hex);
    }
    if (esp32_text_weight !== undefined) {
      await setSystemSetting('esp32_text_weight', esp32_text_weight);
    }
    if (esp32_text_threshold !== undefined) {
      await setSystemSetting('esp32_text_threshold', esp32_text_threshold.toString());
    }

    return NextResponse.json({ 
      success: true, 
      esp32_message,
      esp32_font_scale,
      esp32_display_mode,
      esp32_image_hex,
      esp32_text_hex,
      esp32_text_weight,
      esp32_text_threshold
    });
  } catch (error) {
    console.error('Failed to update system settings:', error);
    return NextResponse.json(
      { error: '설정을 저장하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

