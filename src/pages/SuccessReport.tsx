import React from "react";

// Assets
import SuccessImage from "../assets/images/success.png";
import CheckIcon from "../assets/icons/check.png";

// Components
import StepProgress from "../components/StepProgress";
import IconCircle from "../components/IconCircle";
import Spacer from "../components/Spacer";
import Divider from "../components/Divider";
import Button from "../components/Button";

export interface SuccessReportProps {
  title?: string;
  icon?: string;
  tagline?: string;
  image?: string;
  accentColor?: string;
  secondaryColor?: string;
  onContinue?: () => void;
}

export const SuccessReport: React.FC<SuccessReportProps> = ({
  title = "SCAN ACCOMPLISHMENT REPORT",
  icon = CheckIcon,
  tagline = "Success your accomplishment report on the scanner",
  image = SuccessImage,
  accentColor = "#0E6528",
  secondaryColor = "#7A7F89",
  onContinue
}) => {
  const handleContinue = () => {
    // Detect document from scanner hardware

    onContinue?.();

    // Once we have hardware
  };

  return (
    <>
      {/* Step Progress */}
      <div className="absolute top-[7vh] left-1/2 -translate-x-1/2">
        <StepProgress
          steps={3}
          currentStep={1}
        />
      </div>

      {/* Scan Icon */}
      <section className="flex flex-col justify-center items-center">
        <IconCircle
          size={"19.12vh"}
          border
          shadow
          borderColor="#4FAE4A"
          borderSize="1.1719vh"
          shadowOffsetY={4}
          shadowBlur={53}
          shadowSpread={-8}
        >
          <img
            src={icon}
            alt="Document Icon"
            className="w-[10.2721vh] h-auto"
          />
        </IconCircle>

        <Spacer size={21} />

        <h1
          className="leading-none text-[5.21vh] font-extrabold"
          style={{ color: accentColor }}
        >
          {title}
        </h1>

        <Spacer size={2} />

        <p
          className="w-[44.53vh] leading-4 text-[2.47vh] font-normal text-center tracking-1"
          style={{ color: secondaryColor }}
        >
          {tagline}
        </p>

        <Spacer size={6} />

        <Divider />

        <Spacer size={6} />

        <img
          src={image}
          className="w-[46.61vh] h-auto"
        />
        
        <Spacer size={15} />

        <Button
            onClick={onContinue}
            width={"47.1354vh"}
            height={"6.5833vh"}
            fontSize={"2.6042vh"}
        />

      </section>
    </>
  );
};

export default SuccessReport;