export default function LoadingSpinner({ message = "Laster posisjon og fergekaier..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="flex flex-col items-center">
        <span className="relative flex h-12 w-12 mb-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40"></span>
          <span className="relative inline-flex rounded-full h-12 w-12 border-4 border-t-fuchsia-200 border-b-fuchsia-700 border-l-white border-r-white animate-spin"></span>
        </span>
        <p className="text-lg text-white font-semibold">{message}</p>
      </div>
    </div>
  );
} 