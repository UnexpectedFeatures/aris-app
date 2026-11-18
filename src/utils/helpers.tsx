import { useEffect, useState } from "react";

export function LiveDateTime() {
  
  return (
    <div>
      <p>Day: {date.toLocaleDateString()}</p>
      <p>Time: {date.toLocaleTimeString()}</p>
    </div>
  );
}
