export default function BrandLogo({ size = 32, className = '', alt = 'SnapNext AI', priority = false }) {
  return (
    <img
      src="/logo.svg"
      alt={alt}
      width={size}
      height={size}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
