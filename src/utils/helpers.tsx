import { useEffect, useState } from "react";

export function LiveDateTime() {
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <p>Day: {date.toLocaleDateString()}</p>
      <p>Time: {date.toLocaleTimeString()}</p>
    </div>
  );
}
