export default function LoadingSpinner({ message = "Laster posisjon og fergekaier...", theme }) {
  const isMinima = theme?.layout?.cardStyle === 'minima';
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="flex flex-col items-center">
        <span className="relative flex h-12 w-12 mb-4">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isMinima ? 'bg-black opacity-20' : 'bg-white opacity-40'}`}></span>
          {isMinima ? (
            <span
              className="relative inline-flex rounded-full h-12 w-12 border-4 animate-spin"
              style={{
                borderTopColor: '#000',
                borderBottomColor: '#000',
                borderLeftColor: '#d1d5db', // gray-300
                borderRightColor: '#d1d5db'
              }}
            ></span>
          ) : (
            <span className="relative inline-flex rounded-full h-12 w-12 border-4 border-t-fuchsia-200 border-b-fuchsia-700 border-l-white border-r-white animate-spin"></span>
          )}
        </span>
        <p className={`text-lg font-semibold ${isMinima ? '' : 'text-white'}`} style={isMinima ? { color: theme?.colors?.textPrimary || '#000' } : undefined}>{message}</p>
      </div>
    </div>
  );
} 