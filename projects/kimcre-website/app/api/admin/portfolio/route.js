import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { savePortfolio, updatePortfolio, deletePortfolio } from '@/lib/db';
import { verifyAdminToken } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';

function checkAuth(request) {
  const token = request.cookies.get('admin_session')?.value;
  return verifyAdminToken(token);
}

function revalidatePortfolioPages() {
  revalidatePath('/');
  revalidatePath('/portfolio');
  revalidatePath('/api/portfolio');
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    
    const title = formData.get('title');
    const category = formData.get('category');
    const material = formData.get('material');
    const duration = formData.get('duration');
    const description = formData.get('description');
    const imageFiles = formData.getAll('image');
    
    if (!title || !category || !material || !duration || !description) {
      return NextResponse.json(
        { error: '모든 텍스트 정보는 필수 입력 항목입니다.' },
        { status: 400 }
      );
    }
    
    if (imageFiles.length === 0) {
      return NextResponse.json(
        { error: '포트폴리오 이미지를 최소 하나 이상 선택해 주세요.' },
        { status: 400 }
      );
    }

    const imageUrls = [];
    for (const imageFile of imageFiles) {
      if (imageFile && imageFile instanceof File && imageFile.size > 0) {
        let imageUrl = '';
        
        // Upload to Vercel Blob cloud storage if token is present
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          try {
            const blob = await put(imageFile.name, imageFile, {
              access: 'public',
              addRandomSuffix: true,
            });
            imageUrl = blob.url;
          } catch (blobError) {
            console.error('Failed to upload image to Vercel Blob:', blobError);
          }
        }
        
        // Fallback to local storage (only for local development)
        if (!imageUrl) {
          if (process.env.VERCEL) {
            throw new Error('Vercel Blob upload failed. File storage is not available in production.');
          }
          
          const bytes = await imageFile.arrayBuffer();
          const buffer = Buffer.from(bytes);
          
          const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'portfolio');
          await mkdir(uploadsDir, { recursive: true });
          
          const cleanFileName = imageFile.name.replace(/[\/\\]/g, '_');
          const safeFileName = `${Date.now()}_${cleanFileName}`;
          const filePath = path.join(uploadsDir, safeFileName);
          
          await writeFile(filePath, buffer);
          imageUrl = `/uploads/portfolio/${safeFileName}`;
        }
        imageUrls.push(imageUrl);
      }
    }
    
    if (imageUrls.length === 0) {
      return NextResponse.json(
        { error: '올바른 이미지 파일을 업로드해 주세요.' },
        { status: 400 }
      );
    }
    
    const saved = await savePortfolio({
      title,
      category,
      material,
      duration,
      description,
      image: imageUrls,
    });

    revalidatePortfolioPages();
    
    return NextResponse.json({ success: true, portfolio: saved });
  } catch (error) {
    console.error('Failed to add portfolio:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다: ' + error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const id = formData.get('id');
    
    if (!id) {
      return NextResponse.json({ error: '아이디가 필요합니다.' }, { status: 400 });
    }
    
    const updates = {};
    const title = formData.get('title');
    const category = formData.get('category');
    const material = formData.get('material');
    const duration = formData.get('duration');
    const description = formData.get('description');
    const imageFiles = formData.getAll('image');
    
    if (title !== null) updates.title = title;
    if (category !== null) updates.category = category;
    if (material !== null) updates.material = material;
    if (duration !== null) updates.duration = duration;
    if (description !== null) updates.description = description;
    
    if (imageFiles.length > 0) {
      const imageUrls = [];
      for (const imageFile of imageFiles) {
        if (imageFile && imageFile instanceof File && imageFile.name && imageFile.size > 0) {
          let imageUrl = '';
          
          if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
              const blob = await put(imageFile.name, imageFile, {
                access: 'public',
                addRandomSuffix: true,
              });
              imageUrl = blob.url;
            } catch (blobError) {
              console.error('Failed to upload image to Vercel Blob:', blobError);
            }
          }
          
          if (!imageUrl) {
            if (process.env.VERCEL) {
              throw new Error('Vercel Blob upload failed. File storage is not available in production.');
            }
            
            const bytes = await imageFile.arrayBuffer();
            const buffer = Buffer.from(bytes);
            
            const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'portfolio');
            await mkdir(uploadsDir, { recursive: true });
            
            const cleanFileName = imageFile.name.replace(/[\/\\]/g, '_');
            const safeFileName = `${Date.now()}_${cleanFileName}`;
            const filePath = path.join(uploadsDir, safeFileName);
            
            await writeFile(filePath, buffer);
            imageUrl = `/uploads/portfolio/${safeFileName}`;
          }
          imageUrls.push(imageUrl);
        }
      }
      
      if (imageUrls.length > 0) {
        updates.image = imageUrls;
      }
    }
    
    const updated = await updatePortfolio(id, updates);
    if (!updated) {
      return NextResponse.json({ error: '해당 포트폴리오를 찾을 수 없습니다.' }, { status: 404 });
    }

    revalidatePortfolioPages();
    
    return NextResponse.json({ success: true, portfolio: updated });
  } catch (error) {
    console.error('Failed to update portfolio:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다: ' + error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: '아이디가 필요합니다.' }, { status: 400 });
    }
    
    const deleted = await deletePortfolio(id);
    if (!deleted) {
      return NextResponse.json({ error: '해당 포트폴리오를 찾을 수 없습니다.' }, { status: 404 });
    }

    revalidatePortfolioPages();
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete portfolio:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다: ' + error.message },
      { status: 500 }
    );
  }
}
