import {
  formatStoredTimeRange,
  getScheduleDayTimes,
} from "@/utils/arRecordDisplay";

export function ArScheduleCell({
  days,
  time,
  field,
}: {
  days?: string | number;
  time?: string | number;
  field: "days" | "time";
}) {
  return (
    <div className="flex flex-col">
      {getScheduleDayTimes(days, time).map((schedule, index) => (
        <span key={`${schedule.day}-${index}`}>
          {field === "days"
            ? schedule.day
            : formatStoredTimeRange(schedule.time)}
        </span>
      ))}
    </div>
  );
}
