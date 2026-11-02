import { NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { 
  getSharedFiles, 
  getSharedFile, 
  saveSharedFile, 
  deleteSharedFile, 
  cleanupExpiredFiles 
} from '@/lib/db';
import { put, del } from '@vercel/blob';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

function checkAuth(request) {
  const token = request.cookies.get('admin_session')?.value;
  return verifyAdminToken(token);
}

// Generate a 64-bit, human-copyable hexadecimal code.
async function generateUniqueCode() {
  let attempts = 0;
  while (attempts < 100) {
    const code = crypto.randomBytes(8).toString('hex').toUpperCase();
    const existing = await getSharedFile(code);
    if (!existing) {
      return code;
    }
    attempts++;
  }
  throw new Error('Failed to generate a unique code after 100 attempts.');
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    // Lazily clean up expired files
    await cleanupExpiredFiles();
    
    const files = await getSharedFiles();
    return NextResponse.json(files);
  } catch (error) {
    console.error('Shared files list error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: '유효한 파일이 전송되지 않았습니다.' }, { status: 400 });
    }

    const code = await generateUniqueCode();
    let fileInfo = null;

    // Check if Vercel Blob token is available
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        // Upload to Vercel Blob cloud storage under 'shared/' prefix
        const blob = await put(`shared/${code}_${file.name}`, file, {
          access: 'public',
          addRandomSuffix: false, // code makes it unique already
        });
        
        fileInfo = {
          code,
          fileName: file.name,
          fileUrl: blob.url,
          fileSize: file.size,
          savedName: null,
        };
      } catch (blobError) {
        console.error('Failed to upload file to Vercel Blob:', blobError);
      }
    }

    // Fallback to local storage (for local development)
    if (!fileInfo) {
      if (process.env.VERCEL) {
        throw new Error('Vercel Blob upload failed. File storage is not available in production.');
      }
      
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      const uploadsDir = path.join(process.cwd(), 'uploads', 'shared');
      await mkdir(uploadsDir, { recursive: true });
      
      // Prevent path traversal
      const cleanFileName = file.name.replace(/[\/\\]/g, '_');
      const safeFileName = `${code}_${Date.now()}_${cleanFileName}`;
      const filePath = path.join(uploadsDir, safeFileName);
      
      await writeFile(filePath, buffer);
      
      fileInfo = {
        code,
        fileName: file.name,
        fileUrl: null,
        fileSize: file.size,
        savedName: safeFileName,
      };
    }

    const saved = await saveSharedFile(fileInfo);
    return NextResponse.json({ success: true, file: saved });
  } catch (error) {
    console.error('Shared file upload error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: '공유 코드가 지정되지 않았습니다.' }, { status: 400 });
    }

    const file = await getSharedFile(code);
    if (!file) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Delete from storage
    if (file.fileUrl) {
      // Vercel Blob
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await del(file.fileUrl);
      }
    } else if (file.savedName) {
      // Local storage
      const filePath = path.join(process.cwd(), 'uploads', 'shared', file.savedName);
      await unlink(filePath).catch(() => {});
    }

    // Delete from DB
    await deleteSharedFile(code);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shared file deletion error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
