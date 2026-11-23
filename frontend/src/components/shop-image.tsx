import Image, {type ImageProps} from 'next/image';

// Shop uploads are already resized and converted to WebP by the API. Let the
// browser fetch their stable URL directly, including in localhost development,
// without allowing the Next image optimizer to fetch private network addresses.
export function ShopImage(props: Omit<ImageProps, 'src' | 'unoptimized'> & {src: string}) {
  const uploaded = /^https?:\/\/[^/]+\/api\/uploads\/public\//.test(props.src);
  return <Image {...props} unoptimized={uploaded}/>;
}
