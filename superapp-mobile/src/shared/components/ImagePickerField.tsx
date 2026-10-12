import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@services/api';
import { colors } from '@theme/colors';
import { typography, fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

interface Props {
  value: string | null;
  onChange: (url: string) => void;
  label?: string;
  /** Upload endpoint; defaults to the grocery product-image uploader. */
  uploadUrl?: string;
  /** Extra query params appended to the upload request (e.g. { kind: 'logo' } for food). */
  uploadParams?: Record<string, string>;
  /** Aspect ratio for the crop step. Defaults to square. */
  aspect?: [number, number];
  /** Fixed height for the picker box. */
  height?: number;
}

export const ImagePickerField: React.FC<Props> = ({
  value,
  onChange,
  label = 'Product Image',
  uploadUrl = '/grocery/products/upload-image',
  uploadParams,
  aspect = [1, 1],
  height = 140,
}) => {
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect,
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    setUploading(true);
    try {
      // Resize to 800×800 before upload (saves bandwidth)
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 800, height: 800 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );

      const formData = new FormData();
      formData.append('file', {
        uri: manipulated.uri,
        name: 'product.jpg',
        type: 'image/jpeg',
      } as any);

      const response = await api.postForm(uploadUrl, formData, { params: uploadParams });
      if (response?.image_url) {
        onChange(response.image_url);
      }
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.detail ?? 'Could not upload image');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={[styles.picker, { height }]} onPress={pickAndUpload} disabled={uploading}>
        {uploading ? (
          <View style={styles.uploading}>
            <ActivityIndicator color={colors.primary[500]} />
            <Text style={styles.uploadingText}>Uploading…</Text>
          </View>
        ) : value ? (
          <View style={styles.preview}>
            <Image source={{ uri: value }} style={styles.previewImage} />
            <View style={styles.changeOverlay}>
              <Ionicons name="camera" size={18} color={colors.white} />
              <Text style={styles.changeText}>Change</Text>
            </View>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={32} color={colors.gray[400]} />
            <Text style={styles.placeholderText}>Tap to add image</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.label, fontSize: 13, color: colors.gray[700], marginBottom: 6 },
  picker: {
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploading: { alignItems: 'center', gap: 8 },
  uploadingText: { ...typography.caption, color: colors.text.secondary },
  preview: { width: '100%', height: '100%', position: 'relative' },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  changeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface.overlay,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 4,
  },
  changeText: { color: colors.white, fontSize: 12, fontFamily: fontFamily.semiBold },
  placeholder: { alignItems: 'center', gap: 8 },
  placeholderText: { ...typography.caption, color: colors.text.muted },
});
