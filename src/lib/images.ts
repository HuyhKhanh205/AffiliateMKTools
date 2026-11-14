import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

const MAX_WIDTH = 1440; // Instagram's recommended max width

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Lets the user pick a photo, converts it to JPEG (Instagram accepts only JPEG;
 * iPhone photos are often HEIC), resizes it and uploads it to the public
 * `product-images` bucket. Returns the public URL, or null if the user cancelled.
 */
export async function pickAndUploadProductImage(userId: string): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (picked.canceled || !picked.assets?.length) return null;
  const asset = picked.assets[0];

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH, height: null });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  if (!saved.base64) throw new Error('Không đọc được ảnh, thử ảnh khác.');

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, base64ToBytes(saved.base64), { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
