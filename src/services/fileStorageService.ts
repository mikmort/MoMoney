import { AttachedFile } from '../types';
import { db, StoredFile } from './db';
import { v4 as uuidv4 } from 'uuid';

export class FileStorageService {
  
  /**
   * Store a file and return the attachment metadata
   */
  async storeFile(file: File): Promise<AttachedFile> {
    const fileId = uuidv4();
    const uploadDate = new Date();
    
    // Read file as array buffer
    const arrayBuffer = await this.readFileAsArrayBuffer(file);
    
    // Generate thumbnail for images
    let thumbnail: string | undefined;
    if (file.type.startsWith('image/')) {
      thumbnail = await this.generateThumbnail(file);
    }
    
    // Create attachment metadata
    const attachedFile: AttachedFile = {
      id: fileId,
      filename: file.name,
      fileType: this.getFileType(file.type),
      mimeType: file.type,
      fileSize: file.size,
      uploadDate,
      thumbnail
    };
    
    // Create stored file record
    const storedFile: StoredFile = {
      ...attachedFile,
      data: arrayBuffer
    };
    
    // Save to database
    await db.attachedFiles.add(storedFile);
    
    return attachedFile;
  }
  
  /**
   * Retrieve a stored file's data
   */
  async getFileData(fileId: string): Promise<{ file: AttachedFile; data: ArrayBuffer } | null> {
    const storedFile = await db.attachedFiles.get(fileId);
    if (!storedFile) return null;
    
    const { data, ...attachedFile } = storedFile;
    return {
      file: attachedFile,
      data: data
    };
  }
  
  /**
   * Delete a stored file
   */
  async deleteFile(fileId: string): Promise<void> {
    await db.attachedFiles.delete(fileId);
  }
  
  /**
   * Get file as blob URL for preview
   */
  async getFileUrl(fileId: string): Promise<string | null> {
    const result = await this.getFileData(fileId);
    if (!result) return null;
    
    const blob = new Blob([result.data], { type: result.file.mimeType });
    return URL.createObjectURL(blob);
  }
  
  /**
   * Get file as downloadable blob
   */
  async getFileBlob(fileId: string): Promise<{ blob: Blob; filename: string } | null> {
    const result = await this.getFileData(fileId);
    if (!result) return null;
    
    const blob = new Blob([result.data], { type: result.file.mimeType });
    return {
      blob,
      filename: result.file.filename
    };
  }
  
  private async readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as ArrayBuffer'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
  
  private getFileType(mimeType: string): 'pdf' | 'image' {
    if (mimeType === 'application/pdf') {
      return 'pdf';
    } else if (mimeType.startsWith('image/')) {
      return 'image';
    } else {
      // Default to image for unsupported types
      return 'image';
    }
  }
  
  private async generateThumbnail(file: File, maxSize: number = 150): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          
          // Calculate thumbnail size maintaining aspect ratio
          const { width, height } = this.calculateThumbnailSize(img.width, img.height, maxSize);
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw and compress image
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to base64 with compression
          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
          resolve(thumbnail);
        };
        img.onerror = () => reject(new Error('Failed to load image for thumbnail'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  
  private calculateThumbnailSize(originalWidth: number, originalHeight: number, maxSize: number): { width: number; height: number } {
    if (originalWidth <= maxSize && originalHeight <= maxSize) {
      return { width: originalWidth, height: originalHeight };
    }
    
    const aspectRatio = originalWidth / originalHeight;
    
    if (originalWidth > originalHeight) {
      return {
        width: maxSize,
        height: Math.round(maxSize / aspectRatio)
      };
    } else {
      return {
        width: Math.round(maxSize * aspectRatio),
        height: maxSize
      };
    }
  }
}

// Singleton instance
export const fileStorageService = new FileStorageService();