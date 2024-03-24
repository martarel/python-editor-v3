import { Box, Button, Slider, SliderTrack, SliderFilledTrack, SliderThumb } from "@chakra-ui/react";
import { useState } from "react";
import { WidgetProps } from "./reactWidgetExtension";

interface Pixel {
  x: number;
  y: number;
  brightness: number;
}

interface MicrobitSinglePixelGridProps {
  onClickPixel: (pixel: Pixel) => void;
}

const MicrobitSinglePixelGrid: React.FC<MicrobitSinglePixelGridProps> = ({ onClickPixel }) => {
  const [selectedPixel, setSelectedPixel] = useState<Pixel | null>(null);
  const [brightness, setBrightness] = useState<number>(5);

  const handleClickPixel = (x: number, y: number) => {
    const newPixel: Pixel = { x, y, brightness };
    setSelectedPixel(newPixel);
    onClickPixel(newPixel);
  };

  const handleSliderChange = (value: number) => {
    setBrightness(value);
    if (selectedPixel) {
      const updatedPixel: Pixel = { ...selectedPixel, brightness: value };
      onClickPixel(updatedPixel);
    }
  };

  return (
    <Box display="flex" flexDirection="row" justifyContent="flex-start">
      <Box>
        <Box bg="black" p="10px" borderRadius="5px">
          {[...Array(5)].map((_, y) => (
            <Box key={y} display="flex">
              {[...Array(5)].map((_, x) => (
                <Box key={x} display="flex" mr="2px">
                  <Button
                    size="xs"
                    h="15px"
                    w="15px"
                    p={0}
                    bgColor={selectedPixel?.x === x && selectedPixel.y === y ? `rgba(255, 0, 0, ${brightness / 9})` : "rgba(255, 255, 255, 0)"}
                    _hover={{ bgColor: selectedPixel?.x === x && selectedPixel.y === y ? `rgba(255, 0, 0, ${brightness / 9})` : "rgba(255, 255, 255, 0.5)" }}
                    onClick={() => handleClickPixel(x, y)}
                  />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
      <Box ml="10px">
        <Slider
          aria-label="brightness"
          defaultValue={brightness}
          min={0}
          max={9}
          step={1}
          orientation="vertical"
          _focus={{ boxShadow: "none" }}
          _active={{ bgColor: "transparent" }}
          onChange={handleSliderChange}>
          <SliderTrack>
            <SliderFilledTrack />
          </SliderTrack>
          <SliderThumb />
        </Slider>
      </Box>
    </Box>
  );
};

export const MicrobitSinglePixelComponent = ({ args, from, to, view }: WidgetProps<number>) => {
  const [selectedPixel, setSelectedPixel] = useState<Pixel | null>(null);
  if (Array.isArray(args) && args.length === 3) {
    const [x, y, brightness] = args;
    setSelectedPixel({ x, y, brightness });
  }

  const handleSelectPixel = (pixel: Pixel) => {
    setSelectedPixel(pixel);
    if (selectedPixel !== null) {
      const { x, y, brightness } = selectedPixel;
      console.log(`(${x}, ${y}, ${brightness}) `)
      /*view.dispatch({
        changes: {
          from: from,
          to: to,
          insert: `(${x}, ${y}, ${brightness}) `,
        }
      });
      */
    }
  };

  return (<MicrobitSinglePixelGrid onClickPixel={handleSelectPixel} />);
};
